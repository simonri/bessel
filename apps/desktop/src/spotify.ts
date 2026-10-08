import dbus, {
  type ClientInterface,
  type MessageBus,
  type Variant,
} from "dbus-next";
import { broadcast } from "./ipc.js";

const MPRIS_PREFIX = "org.mpris.MediaPlayer2.";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const PLAYER_INTERFACE = "org.mpris.MediaPlayer2.Player";
const PROPERTIES_INTERFACE = "org.freedesktop.DBus.Properties";
const DBUS_SERVICE = "org.freedesktop.DBus";
const DBUS_PATH = "/org/freedesktop/DBus";
const SPOTIFY_WATCHDOG_MS = 5000;
const RECONNECT_MAX_MS = 60_000;

export interface SpotifyStatus {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  lengthMs?: number;
}

type Properties = Record<string, Variant>;
type Metadata = Record<string, Variant>;

let status: SpotifyStatus = { running: false };
let bus: MessageBus | null = null;
let player: ClientInterface | null = null;
let properties: ClientInterface | null = null;
let connectedService: string | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let connecting = false;
let reconnectDelayMs = SPOTIFY_WATCHDOG_MS;
let reconnectAt = 0;
let refreshSeq = 0;

function variantValue<T>(value: Variant<T> | undefined): T | undefined {
  return value?.value;
}

function numberValue(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectStatus(all: Properties): SpotifyStatus {
  const metadata = variantValue<Metadata>(all.Metadata) ?? {};
  const artists = variantValue<string[]>(metadata["xesam:artist"]) ?? [];

  return {
    running: true,
    playing: variantValue<string>(all.PlaybackStatus) === "Playing",
    title: variantValue<string>(metadata["xesam:title"]) ?? "",
    artist: artists.join(", "),
    album: variantValue<string>(metadata["xesam:album"]) ?? "",
    artUrl: variantValue<string>(metadata["mpris:artUrl"]) ?? "",
    lengthMs: Math.round(
      numberValue(variantValue(metadata["mpris:length"])) / 1000,
    ),
  };
}

function setStatus(next: SpotifyStatus): void {
  status = next;
  broadcast("spotify:status-changed", next);
}

async function refreshStatus(): Promise<void> {
  if (!properties) return;
  // PropertiesChanged can fire in bursts; only the newest read may land, or
  // an older GetAll resolving late would roll the status back.
  const seq = ++refreshSeq;
  const source = properties;
  try {
    const all = (await source.GetAll(PLAYER_INTERFACE)) as Properties;
    if (seq === refreshSeq && properties === source)
      setStatus(projectStatus(all));
  } catch {
    if (seq === refreshSeq && properties === source) disconnectPlayer();
  }
}

const onPropertiesChanged = (interfaceName: string): void => {
  if (interfaceName === PLAYER_INTERFACE) void refreshStatus();
};

function disconnectPlayer(): void {
  properties?.removeListener("PropertiesChanged", onPropertiesChanged);
  player = null;
  properties = null;
  connectedService = null;
  if (status.running) setStatus({ running: false });
}

async function listSpotifyService(
  activeBus: MessageBus,
): Promise<string | null> {
  const object = await activeBus.getProxyObject(DBUS_SERVICE, DBUS_PATH);
  const dbusInterface = object.getInterface(DBUS_SERVICE);
  const names = (await dbusInterface.ListNames()) as string[];
  return (
    names.find(
      (name) =>
        name.startsWith(MPRIS_PREFIX) && name.toLowerCase().includes("spotify"),
    ) ?? null
  );
}

function connectBus(): void {
  try {
    const next = dbus.sessionBus();
    bus = next;
    next.on("error", () => handleBusError(next));
  } catch {
    bus = null;
    scheduleReconnect();
  }
}

// A MessageBus that errored (session bus restarted, socket closed) never
// recovers on its own: drop it and let the watchdog connect a fresh one.
function handleBusError(failed: MessageBus): void {
  if (bus !== failed) return;
  disconnectPlayer();
  bus = null;
  try {
    failed.disconnect();
  } catch {
    // already gone
  }
  scheduleReconnect();
}

function scheduleReconnect(): void {
  reconnectAt = Date.now() + reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
}

async function watchdogTick(): Promise<void> {
  if (connecting) return;
  if (!bus) {
    if (Date.now() < reconnectAt) return;
    connectBus();
    if (!bus) return;
  }
  const activeBus: MessageBus = bus;
  connecting = true;
  try {
    let service: string | null;
    try {
      service = await listSpotifyService(activeBus);
    } catch {
      // The bus itself can't answer: same recovery as an "error" event.
      handleBusError(activeBus);
      return;
    }
    if (bus !== activeBus) return;
    reconnectDelayMs = SPOTIFY_WATCHDOG_MS;
    if (!service) {
      disconnectPlayer();
      return;
    }
    if (service === connectedService && player && properties) return;

    disconnectPlayer();
    const object = await activeBus.getProxyObject(service, MPRIS_PATH);
    if (bus !== activeBus) return;
    player = object.getInterface(PLAYER_INTERFACE);
    properties = object.getInterface(PROPERTIES_INTERFACE);
    connectedService = service;
    properties.on("PropertiesChanged", onPropertiesChanged);
    await refreshStatus();
  } catch {
    disconnectPlayer();
  } finally {
    connecting = false;
  }
}

export function getSpotifyStatus(): SpotifyStatus {
  return status;
}

/** Playback position in ms. MPRIS doesn't signal Position changes, so it's
 *  read on demand rather than pushed with the status. */
export async function getSpotifyPositionMs(): Promise<number | null> {
  if (!properties) return null;
  try {
    const position = (await properties.Get(
      PLAYER_INTERFACE,
      "Position",
    )) as Variant;
    return Math.round(numberValue(variantValue(position)) / 1000);
  } catch {
    return null;
  }
}

export async function spotifyPlayPause(): Promise<void> {
  if (!player) throw new Error("Spotify is not running");
  await player.PlayPause();
}

export async function spotifyNext(): Promise<void> {
  if (!player) throw new Error("Spotify is not running");
  await player.Next();
}

export function startSpotifyWatcher(): void {
  // MPRIS is a Linux desktop standard. Other platforms keep the integration
  // unavailable instead of attempting to connect to a nonexistent session bus.
  if (process.platform !== "linux" || watchdogTimer) return;
  reconnectDelayMs = SPOTIFY_WATCHDOG_MS;
  reconnectAt = 0;
  void watchdogTick();
  watchdogTimer = setInterval(watchdogTick, SPOTIFY_WATCHDOG_MS);
}

export function stopSpotifyWatcher(): void {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
  disconnectPlayer();
  bus?.disconnect();
  bus = null;
}

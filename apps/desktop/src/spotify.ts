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
  try {
    const all = (await properties.GetAll(PLAYER_INTERFACE)) as Properties;
    setStatus(projectStatus(all));
  } catch {
    disconnectPlayer();
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

async function listSpotifyService(): Promise<string | null> {
  if (!bus) return null;
  const object = await bus.getProxyObject(DBUS_SERVICE, DBUS_PATH);
  const dbusInterface = object.getInterface(DBUS_SERVICE);
  const names = (await dbusInterface.ListNames()) as string[];
  return (
    names.find(
      (name) =>
        name.startsWith(MPRIS_PREFIX) && name.toLowerCase().includes("spotify"),
    ) ?? null
  );
}

async function watchdogTick(): Promise<void> {
  if (!bus || connecting) return;
  connecting = true;
  try {
    const service = await listSpotifyService();
    if (!service) {
      disconnectPlayer();
      return;
    }
    if (service === connectedService && player && properties) return;

    disconnectPlayer();
    const object = await bus.getProxyObject(service, MPRIS_PATH);
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
  if (process.platform !== "linux" || bus) return;
  try {
    bus = dbus.sessionBus();
    bus.on("error", disconnectPlayer);
    void watchdogTick();
    watchdogTimer = setInterval(watchdogTick, SPOTIFY_WATCHDOG_MS);
  } catch {
    bus = null;
  }
}

export function stopSpotifyWatcher(): void {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
  disconnectPlayer();
  bus?.disconnect();
  bus = null;
}

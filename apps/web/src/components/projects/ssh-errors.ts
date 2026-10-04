// Electron prefixes errors thrown in the main process with this.
const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/;

/** The error as ssh reported it, for a "Details" disclosure. */
export function rawSshError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(IPC_PREFIX, "").trim();
}

/** What went wrong connecting to `host`, said plainly. */
export function explainSshError(error: unknown, host: string): string {
  const raw = rawSshError(error);
  if (/could not resolve hostname|name or service not known/i.test(raw))
    return `Couldn't find a server called “${host}”. Check the spelling, or add it to your SSH config.`;
  if (/remote host identification has changed/i.test(raw))
    return `${host}'s identity has changed since you last connected. If you expected that, remove its old entry from ~/.ssh/known_hosts and try again.`;
  if (
    /permission denied|publickey|authentication|host key verification/i.test(
      raw,
    )
  )
    return `${host} didn't accept your SSH key. Bessel signs in with keys only, not passwords. Make sure \`ssh ${host}\` works in a terminal without asking for a password.`;
  if (/connection refused/i.test(raw))
    return `${host} refused the connection. Check that SSH is running on it and the port is right.`;
  if (
    /timed out|timeout|SIGTERM|no route to host|network is unreachable/i.test(
      raw,
    )
  )
    return `${host} didn't answer. Check that it's switched on and reachable from this network.`;
  if (/no such file or directory|not a directory/i.test(raw))
    return "That folder doesn't exist on the server.";
  if (/file exists/i.test(raw))
    return "A folder with that name already exists.";
  return `Couldn't connect to ${host}.`;
}

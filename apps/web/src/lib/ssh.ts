export function sshQuote(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/** `ssh` arguments that run `remote` in a terminal on `host`. The `--` keeps a host like `-oProxyCommand=…` from being read as an option. */
export function sshTerminalArgs(host: string, remote: string): string[] {
  return ["-t", "--", host, remote];
}

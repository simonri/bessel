/** The signed-in user's token from a request Klarna's page makes, if it carries one. */
export function bearerToken(
  headers: Record<string, string | undefined>,
): string | null {
  const value = headers.Authorization ?? headers.authorization;
  return value?.startsWith("Bearer ") && value.length > "Bearer ".length
    ? value
    : null;
}

/** Klarna sends BankID on this computer to the BankID app, through its own URL scheme. */
export function isBankIdLink(url: string): boolean {
  return url.toLowerCase().startsWith("bankid:");
}

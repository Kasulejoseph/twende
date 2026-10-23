export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function redactText(text: string, secrets: readonly string[]): string {
  const sorted = [...secrets].filter((secret) => secret.length > 0).sort((left, right) => right.length - left.length);
  return sorted.reduce((current, secret) => current.split(secret).join('[redacted]'), text);
}

export function safeJson(value: unknown, secrets: readonly string[] = []): string {
  const serialised = JSON.stringify(value, null, 2);
  return redactText(serialised ?? 'null', secrets);
}

export function truncate(text: string, maxLength = 16_000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…[truncated]`;
}

export function safeInternalRedirectPath(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return undefined;
  }

  try {
    const origin = "https://facilityos.invalid";
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return undefined;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return undefined;
  }
}

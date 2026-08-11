export function normaliseDomain(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/^\*\./, "").replace(/\/+$/, "");
  if (value.length === 0) return "";

  const withHost = value.includes("://") ? value : `https://${value}`;
  try {
    const host = new URL(withHost).hostname.replace(/\.$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : "";
  } catch {
    return "";
  }
}

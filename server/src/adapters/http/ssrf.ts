import { isIP } from 'node:net';

export type BlockReason =
  | 'scheme'
  | 'not_allowlisted'
  | 'literal_ip'
  | 'credentials'
  | 'private_address';

export class BlockedUrlError extends Error {
  constructor(readonly reason: BlockReason, message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

function ipv4ToParts(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

function isPrivateIpv4(address: string): boolean {
  const p = ipv4ToParts(address);
  if (!p) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const a = address.toLowerCase().split('%')[0] ?? '';
  if (a === '::' || a === '::1') return true;
  if (a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) {
    return true;
  }
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  if (a.startsWith('ff')) return true;
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function normaliseHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

export function isAllowlistedHost(host: string, allowlist: readonly string[]): boolean {
  const h = normaliseHost(host);
  return allowlist.some((entry) => {
    const e = normaliseHost(entry.trim().replace(/^\*\./, ''));
    if (e.length === 0) return false;
    return h === e || h.endsWith(`.${e}`);
  });
}

export function assertFetchable(rawUrl: string, allowlist: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('scheme', `not a URL: ${rawUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BlockedUrlError('scheme', `scheme not allowed: ${url.protocol}`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new BlockedUrlError('credentials', 'url carries credentials');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) {
    throw new BlockedUrlError('literal_ip', `literal IP host: ${host}`);
  }
  if (!isAllowlistedHost(host, allowlist)) {
    throw new BlockedUrlError('not_allowlisted', `host not allowlisted: ${host}`);
  }
  return url;
}

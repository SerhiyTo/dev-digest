import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { BlockedUrlError, assertFetchable, isBlockedAddress } from './ssrf.js';

export interface FetchedPage {
  url: string;
  title: string | null;
  text: string;
}

export interface GuardedFetchOptions {
  allowlist: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

const ALLOWED_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/xhtml+xml',
  'application/json',
];

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const safe = addresses.filter((a) => !isBlockedAddress(a.address));
    if (safe.length === 0) {
      callback(
        new BlockedUrlError('private_address', `${hostname} resolves only to blocked addresses`),
        '',
        0,
      );
      return;
    }
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: typeof safe) => void)(null, safe);
      return;
    }
    const first = safe[0]!;
    callback(null, first.address, first.family);
  });
};

function contentTypeAllowed(header: string | undefined): boolean {
  if (!header) return false;
  const mime = header.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_CONTENT_TYPES.includes(mime);
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: title && title.length > 0 ? title : null, text };
}

function once(url: URL, opts: GuardedFetchOptions): Promise<{ page?: FetchedPage; redirect?: string }> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        headers: {
          accept: ALLOWED_CONTENT_TYPES.join(', '),
          'user-agent': 'devdigest-intent/1.0',
          'accept-encoding': 'identity',
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (REDIRECT_CODES.has(status)) {
          const location = res.headers.location;
          res.destroy();
          if (!location) {
            reject(new BlockedUrlError('scheme', `redirect without a location from ${url.host}`));
            return;
          }
          resolve({ redirect: new URL(location, url).toString() });
          return;
        }

        if (status < 200 || status >= 300) {
          res.destroy();
          reject(new Error(`HTTP ${status} from ${url.host}`));
          return;
        }

        if (!contentTypeAllowed(res.headers['content-type'])) {
          res.destroy();
          reject(new Error(`content-type not allowed: ${res.headers['content-type'] ?? 'none'}`));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - opts.maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('close', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const isHtml = (res.headers['content-type'] ?? '').includes('html');
          const { title, text } = isHtml ? htmlToText(raw) : { title: null, text: raw };
          resolve({ page: { url: url.toString(), title, text: text.slice(0, opts.maxBytes) } });
        });
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(new Error(`timeout after ${opts.timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchGuarded(rawUrl: string, opts: GuardedFetchOptions): Promise<FetchedPage> {
  let target = rawUrl;

  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const url = assertFetchable(target, opts.allowlist);
    const { page, redirect } = await once(url, opts);
    if (page) return page;
    target = redirect!;
  }
  throw new BlockedUrlError('scheme', `too many redirects for ${rawUrl}`);
}

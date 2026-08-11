/**
 * The URL guard. Every input here is attacker-controlled: the URLs come from a
 * PR body. The allowlist is what turns fetching on at all, and the address
 * checks are what stop an allowlisted name from pointing at the host's own
 * network. Both must hold independently.
 */
import { describe, it, expect } from 'vitest';
import {
  BlockedUrlError,
  assertFetchable,
  isAllowlistedHost,
  isBlockedAddress,
} from '../src/adapters/http/ssrf.js';
import { htmlToText } from '../src/adapters/http/fetcher.js';

const ALLOW = ['wiki.test', 'notion.so'];

function reasonFor(url: string, allow: readonly string[] = ALLOW): string {
  try {
    assertFetchable(url, allow);
    return 'ALLOWED';
  } catch (err) {
    return err instanceof BlockedUrlError ? err.reason : 'OTHER';
  }
}

describe('allowlist is the on-switch', () => {
  it('blocks everything when the allowlist is empty', () => {
    expect(reasonFor('https://wiki.test/page', [])).toBe('not_allowlisted');
    expect(reasonFor('https://github.com/a/b', [])).toBe('not_allowlisted');
  });

  it('allows an exact host and its subdomains only', () => {
    expect(isAllowlistedHost('wiki.test', ALLOW)).toBe(true);
    expect(isAllowlistedHost('eu.wiki.test', ALLOW)).toBe(true);
    expect(isAllowlistedHost('WIKI.TEST', ALLOW)).toBe(true);
    expect(isAllowlistedHost('wiki.test.evil.com', ALLOW)).toBe(false);
    expect(isAllowlistedHost('notwiki.test', ALLOW)).toBe(false);
  });

  it('is not fooled by a trailing dot or a leading wildcard entry', () => {
    expect(isAllowlistedHost('wiki.test.', ALLOW)).toBe(true);
    expect(isAllowlistedHost('eu.wiki.test', ['*.wiki.test'])).toBe(true);
  });
});

describe('assertFetchable', () => {
  const CASES: [string, string][] = [
    ['file:///etc/passwd', 'scheme'],
    ['ftp://wiki.test/x', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['not a url', 'scheme'],
    ['https://user:pw@wiki.test/x', 'credentials'],
    ['https://127.0.0.1/x', 'literal_ip'],
    ['https://169.254.169.254/latest/meta-data/', 'literal_ip'],
    ['https://[::1]/x', 'literal_ip'],
    ['https://evil.test/x', 'not_allowlisted'],
    ['https://wiki.test.evil.test/x', 'not_allowlisted'],
  ];

  it.each(CASES)('blocks %s as %s', (url, reason) => {
    expect(reasonFor(url)).toBe(reason);
  });

  it('allows an allowlisted https host', () => {
    expect(reasonFor('https://wiki.test/rfc/12')).toBe('ALLOWED');
    expect(reasonFor('https://eu.notion.so/page')).toBe('ALLOWED');
  });

  it('rejects a literal IP even when someone allowlists it', () => {
    expect(reasonFor('https://169.254.169.254/', ['169.254.169.254'])).toBe('literal_ip');
  });
});

describe('isBlockedAddress', () => {
  const BLOCKED = [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
    'not-an-ip',
  ];

  it.each(BLOCKED)('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  const ALLOWED = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'];

  it.each(ALLOWED)('permits public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('htmlToText', () => {
  it('drops scripts, styles and comments rather than feeding them to the model', () => {
    const { text } = htmlToText(
      '<html><head><style>a{}</style></head><body><script>steal()</script><!-- hi --><p>Real content</p></body></html>',
    );
    expect(text).toContain('Real content');
    expect(text).not.toContain('steal()');
    expect(text).not.toContain('a{}');
    expect(text).not.toContain('hi');
  });

  it('extracts a title and decodes the common entities', () => {
    const { title, text } = htmlToText('<title>RFC 12</title><p>a &amp; b &lt;c&gt;</p>');
    expect(title).toBe('RFC 12');
    expect(text).toContain('a & b <c>');
  });
});

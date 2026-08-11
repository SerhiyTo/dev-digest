import { posix } from 'node:path';
import {
  DOC_EXTENSIONS,
  DOC_ROOTS,
  MAX_BODY_CHARS,
  MAX_DOC_PATH_CHARS,
  MAX_DOC_REFERENCES,
  MAX_EXTERNAL_REFERENCES,
  MAX_ISSUE_REFERENCES,
  MAX_LINK_REFERENCES,
} from './constants.js';

export interface DocReference {
  path: string;
}

export type ExternalReferenceKind = 'issue' | 'jira' | 'url';

export interface ExternalReference {
  kind: ExternalReferenceKind;
  ref: string;
}

export interface IssueReference {
  owner: string | null;
  repo: string | null;
  number: number;
  ref: string;
}

export interface LinkReference {
  url: string;
}

const MARKDOWN_LINK = /\[[^\]\n]{0,200}\]\(([^)\s]{1,300})\)/g;
const BACKTICKED = /`([^`\n]{1,300})`/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

const ISSUE_REF = /(?:^|[\s([])#(\d{1,7})\b/g;
const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,7})\b/g;
const URL_REF = /\bhttps?:\/\/[^\s<>()[\]"'`]{1,500}/g;

function decodesToItself(raw: string): boolean {
  try {
    return decodeURIComponent(raw) === raw;
  } catch {
    return false;
  }
}

export function isSafeDocPath(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length === 0 || value.length > MAX_DOC_PATH_CHARS) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (!decodesToItself(value)) return false;
  if (value.startsWith('/') || value.startsWith('~')) return false;
  if (SCHEME.test(value)) return false;
  if (posix.normalize(value) !== value) return false;

  const segments = value.split('/');
  if (segments.some((s) => s.length === 0 || s === '.' || s === '..')) return false;
  if (!segments.some((s) => (DOC_ROOTS as readonly string[]).includes(s.toLowerCase()))) {
    return false;
  }
  return DOC_EXTENSIONS.some((ext) => value.toLowerCase().endsWith(ext));
}

function collectCandidates(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MARKDOWN_LINK)) if (m[1]) out.push(m[1]);
  for (const m of body.matchAll(BACKTICKED)) if (m[1]) out.push(m[1]);
  for (const token of body.split(/\s+/)) out.push(token);
  return out;
}

export function extractDocReferences(body: string): DocReference[] {
  const scanned = body.slice(0, MAX_BODY_CHARS);
  const seen = new Set<string>();
  const refs: DocReference[] = [];

  for (const raw of collectCandidates(scanned)) {
    const value = raw.trim().replace(TRAILING_PUNCTUATION, '');
    if (seen.has(value) || !isSafeDocPath(value)) continue;
    seen.add(value);
    refs.push({ path: value });
    if (refs.length === MAX_DOC_REFERENCES) break;
  }
  return refs;
}

const NAME = '[A-Za-z0-9._-]{1,100}';
const GITHUB_ISSUE_URL = new RegExp(
  `https?://(?:www\\.)?github\\.com/(${NAME})/(${NAME})/(?:issues|pull)/(\\d{1,7})\\b`,
  'g',
);
const CROSS_REPO_REF = new RegExp(`\\b(${NAME})/(${NAME})#(\\d{1,7})\\b`, 'g');

export function extractIssueReferences(body: string): IssueReference[] {
  const scanned = body.slice(0, MAX_BODY_CHARS);
  const seen = new Set<string>();
  const refs: IssueReference[] = [];

  const push = (owner: string | null, repo: string | null, num: number, ref: string) => {
    const key = `${owner ?? ''}/${repo ?? ''}#${num}`;
    if (seen.has(key) || refs.length >= MAX_ISSUE_REFERENCES) return;
    seen.add(key);
    refs.push({ owner, repo, number: num, ref });
  };

  for (const m of scanned.matchAll(GITHUB_ISSUE_URL)) {
    push(m[1] ?? null, m[2] ?? null, Number(m[3]), m[0]);
  }
  for (const m of scanned.matchAll(CROSS_REPO_REF)) {
    push(m[1] ?? null, m[2] ?? null, Number(m[3]), `${m[1]}/${m[2]}#${m[3]}`);
  }
  for (const m of scanned.matchAll(ISSUE_REF)) {
    if (m[1]) push(null, null, Number(m[1]), `#${m[1]}`);
  }
  return refs;
}

export function extractLinkReferences(body: string): LinkReference[] {
  const scanned = body.slice(0, MAX_BODY_CHARS);
  const issueUrls = new Set(Array.from(scanned.matchAll(GITHUB_ISSUE_URL), (m) => m[0]));
  const seen = new Set<string>();
  const refs: LinkReference[] = [];

  for (const m of scanned.matchAll(URL_REF)) {
    const url = m[0].replace(TRAILING_PUNCTUATION, '');
    if (issueUrls.has(url) || seen.has(url)) continue;
    seen.add(url);
    refs.push({ url });
    if (refs.length === MAX_LINK_REFERENCES) break;
  }
  return refs;
}

export function extractExternalReferences(body: string): ExternalReference[] {
  const scanned = body.slice(0, MAX_BODY_CHARS);
  const seen = new Set<string>();
  const refs: ExternalReference[] = [];

  const push = (kind: ExternalReferenceKind, ref: string) => {
    const key = `${kind}:${ref}`;
    if (seen.has(key) || refs.length >= MAX_EXTERNAL_REFERENCES) return;
    seen.add(key);
    refs.push({ kind, ref });
  };

  for (const m of scanned.matchAll(URL_REF)) {
    push('url', m[0].replace(TRAILING_PUNCTUATION, ''));
  }
  for (const m of scanned.matchAll(ISSUE_REF)) if (m[1]) push('issue', `#${m[1]}`);
  for (const m of scanned.matchAll(JIRA_KEY)) if (m[1]) push('jira', m[1]);

  return refs;
}

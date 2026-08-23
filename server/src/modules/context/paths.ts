import { posix } from 'node:path';
import { DOC_EXTENSIONS, DOC_ROOTS, type DocRoot } from './constants.js';

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LABEL_DISALLOWED = /[^A-Za-z0-9._/-]/g;

function decodesToItself(raw: string): boolean {
  try {
    return decodeURIComponent(raw) === raw;
  } catch {
    return false;
  }
}

function asDocRoot(segment: string): DocRoot | null {
  const lowered = segment.toLowerCase();
  return DOC_ROOTS.find((root) => root === lowered) ?? null;
}

export function isProjectDocPath(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length === 0) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (!decodesToItself(value)) return false;
  if (value.startsWith('/') || value.startsWith('~')) return false;
  if (SCHEME.test(value)) return false;
  if (posix.normalize(value) !== value) return false;

  const segments = value.split('/');
  if (segments.some((s) => s.length === 0 || s === '.' || s === '..')) return false;

  const [first] = segments;
  if (first === undefined || asDocRoot(first) === null) return false;
  if (segments.length < 2) return false;

  const lowered = value.toLowerCase();
  return DOC_EXTENSIONS.some((ext) => lowered.endsWith(ext));
}

export function categoryOf(candidate: string): DocRoot | null {
  if (!isProjectDocPath(candidate)) return null;
  const [first] = candidate.trim().split('/');
  return first === undefined ? null : asDocRoot(first);
}

export function sanitizePathLabel(path: string): string {
  return path.replace(LABEL_DISALLOWED, '');
}

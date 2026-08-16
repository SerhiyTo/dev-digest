#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { register } from 'tsx/esm/api';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TSX_TSCONFIG_PATH ??= resolve(packageRoot, 'tsconfig.json');

register();
await import('../src/index.ts');

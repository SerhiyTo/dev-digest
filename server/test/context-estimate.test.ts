import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TiktokenTokenizer, approxTokens } from '../src/adapters/tokenizer/index.js';

const encoder = vi.hoisted(() => ({ fails: false }));

vi.mock('js-tiktoken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-tiktoken')>();
  return {
    ...actual,
    getEncoding: (name: Parameters<typeof actual.getEncoding>[0]) => {
      if (encoder.fails) throw new Error('BPE ranks unavailable');
      return actual.getEncoding(name);
    },
  };
});

describe('TiktokenTokenizer.estimator', () => {
  beforeEach(() => {
    encoder.fails = false;
  });

  it('counts with cl100k_base and reports it', () => {
    const tokenizer = new TiktokenTokenizer();

    expect(tokenizer.count('hello world')).toBe(2);
    expect(approxTokens('hello world')).toBe(3);
    expect(tokenizer.estimator()).toBe('cl100k_base');
  });

  it('reports cl100k_base before any text has been counted', () => {
    expect(new TiktokenTokenizer().estimator()).toBe('cl100k_base');
  });

  it('falls back to the heuristic and reports it once the encoder fails', () => {
    encoder.fails = true;
    const tokenizer = new TiktokenTokenizer();
    const text = 'x'.repeat(4_001);

    expect(tokenizer.count(text)).toBe(approxTokens(text));
    expect(tokenizer.estimator()).toBe('heuristic');
  });

  it('keeps reporting the heuristic after the encoder recovers, because the flag is sticky', () => {
    encoder.fails = true;
    const tokenizer = new TiktokenTokenizer();
    tokenizer.count('first call breaks the encoder');

    encoder.fails = false;

    expect(tokenizer.count('second call')).toBe(approxTokens('second call'));
    expect(tokenizer.estimator()).toBe('heuristic');
  });
});

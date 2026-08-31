import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  PromptAssembly,
  BlastRadius,
  BlastRadiusResponse,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalTrendPoint,
  MemoryItem,
  RunTrace,
  RunSummary,
  Settings,
  Repo,
  PrDetail,
  MergeRisk,
  ReviewFocusRow,
  PrBriefFileSummary,
  PrBrief,
  PrBriefGenerationState,
  PrBriefResponse,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('BlastRadiusResponse round-trips a full fixture (persistent + history + rollups)', () => {
    const fixture = {
      changed_symbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'router', file: 'src/api/public/index.ts', line: 23 }],
          endpoints_affected: ['GET /api/public/items'],
          crons_affected: ['reset-rate-buckets'],
        },
      ],
      summary: '1 changed symbol, 1 caller across 1 file, 1 endpoint, 1 cron job.',
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: ['reset-rate-buckets'],
      history: [
        {
          pr_number: 415,
          title: 'tighten rate limiting',
          merged_at: '2026-08-01T00:00:00.000Z',
          author: 'octocat',
          files_overlap: ['src/middleware/ratelimit.ts'],
          notes: 'merged',
        },
      ],
      truncated: false,
      degraded: false,
      reason: '',
    };

    const parsed = BlastRadiusResponse.parse(fixture);
    expect(parsed).toEqual(fixture);
  });

  it('BlastCaller — a legacy caller without kind still parses (T3.5, additive/MINOR)', () => {
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            // no `kind` field — pre-T3.5 payload shape.
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();

    const withKind = BlastRadius.parse({
      changed_symbols: [{ name: 'DebtItem', file: 'a.ts', kind: 'interface' }],
      downstream: [
        {
          symbol: 'DebtItem',
          callers: [{ name: 'useDebt', file: 'b.ts', line: 10, kind: 'type' }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      summary: 's',
    });
    expect(withKind.downstream[0]?.callers[0]?.kind).toBe('type');
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(
      Onboarding.safeParse({
        sections: [{ kind: 'routes_and_apis', title: 'T', body: 'b', links: [] }],
      }).success,
    ).toBe(false);
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    expect(trace.stats.cost_usd).toBe(0.06);
  });

  it('RunTrace parses historical stats without cost_usd (frozen jsonb back-compat)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', model: 'gpt-4.1', source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.stats.cost_usd ?? null).toBeNull();
  });

  it('RunSummary parses ci_fail_on absent, null, and a valid enum value; rejects an out-of-enum value', () => {
    const base = {
      run_id: 'r1',
      agent_id: 'a1',
      agent_name: 'Security Reviewer',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      status: 'done',
      error: null,
      duration_ms: 8200,
      tokens_in: 14820,
      tokens_out: 1240,
      cost_usd: 0.06,
      findings_count: 3,
      grounding: '3/3 passed',
      ran_at: '2026-08-24T00:00:00.000Z',
      score: 61,
      blockers: 1,
    };

    const absent = RunSummary.safeParse(base);
    expect(absent.success).toBe(true);
    expect(absent.success && absent.data.ci_fail_on).toBeUndefined();

    const nullValue = RunSummary.safeParse({ ...base, ci_fail_on: null });
    expect(nullValue.success).toBe(true);
    expect(nullValue.success && nullValue.data.ci_fail_on).toBeNull();

    const withValue = RunSummary.safeParse({ ...base, ci_fail_on: 'critical' });
    expect(withValue.success).toBe(true);
    expect(withValue.success && withValue.data.ci_fail_on).toBe('critical');

    expect(RunSummary.safeParse({ ...base, ci_fail_on: 'sometimes' }).success).toBe(false);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

/**
 * `pr_intent` rows and `run_traces.trace` documents written before the Intent
 * Layer shipped must keep parsing: the trace jsonb is frozen, so a historical
 * document genuinely lacks these keys.
 */
describe('Intent Layer — backward compatibility', () => {
  it('parses a legacy Intent that predates risk_areas / evidence / confidence', () => {
    const legacy = Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: [] });
    expect(legacy.risk_areas).toEqual([]);
    expect(legacy.evidence).toEqual([]);
    expect(legacy.confidence).toBeUndefined();
  });

  it('leaves confidence unknown rather than defaulting it to zero', () => {
    expect(Intent.parse({ intent: 'x', in_scope: [], out_of_scope: [] }).confidence).not.toBe(0);
  });

  it('rejects a confidence outside 0..1', () => {
    const parsed = Intent.safeParse({
      intent: 'x',
      in_scope: [],
      out_of_scope: [],
      confidence: 1.4,
    });
    expect(parsed.success).toBe(false);
  });

  it('parses a legacy PromptAssembly with no intent key', () => {
    const parsed = PromptAssembly.safeParse({ system: 's', user: 'u' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.intent).toBeUndefined();
  });
});

describe('PR Brief — merge risk, review focus, file summaries', () => {
  const legacyBrief = {
    intent: { intent: 'x', in_scope: ['a'], out_of_scope: ['b'] },
    blast: {
      changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
          endpoints_affected: ['GET /x'],
          crons_affected: ['c'],
        },
      ],
      summary: 's',
    },
    risks: {
      risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts'] }],
    },
    history: {
      history: [
        {
          pr_number: 401,
          title: 't',
          merged_at: '2026-03-18',
          author: 'a',
          files_overlap: [],
          notes: 'n',
        },
      ],
    },
  };

  const fullBrief = {
    ...legacyBrief,
    summary: 'A short brief summary.',
    merge_risk: 'medium',
    review_focus: [{ file: 'a.ts', start_line: 1, end_line: 3, reason: 'touches the rate limiter' }],
    file_summaries: [{ path: 'a.ts', summary: 'Adjusts the rate limit window.' }],
    degraded_reason: null,
    truncated: false,
    head_sha: 'abc123',
    model: 'claude-sonnet-5',
    review_models: ['claude-sonnet-5', 'gpt-4.1'],
    tokens_in: 1200,
    tokens_out: 300,
    cost_usd: 0.05,
  };

  it('MergeRisk accepts only low/medium/high', () => {
    expect(MergeRisk.safeParse('medium').success).toBe(true);
    expect(MergeRisk.safeParse('extreme').success).toBe(false);
  });

  it('ReviewFocusRow enforces the 140-character reason cap', () => {
    expect(
      ReviewFocusRow.safeParse({ file: 'a.ts', start_line: 1, end_line: 2, reason: 'x'.repeat(140) }).success,
    ).toBe(true);
    expect(
      ReviewFocusRow.safeParse({ file: 'a.ts', start_line: 1, end_line: 2, reason: 'x'.repeat(141) }).success,
    ).toBe(false);
  });

  it('PrBriefFileSummary enforces the 200-character summary cap', () => {
    expect(PrBriefFileSummary.safeParse({ path: 'a.ts', summary: 'x'.repeat(200) }).success).toBe(true);
    expect(PrBriefFileSummary.safeParse({ path: 'a.ts', summary: 'x'.repeat(201) }).success).toBe(false);
  });

  it('PrBrief.safeParse accepts the legacy four-field shape now that the new fields are optional', () => {
    const parsed = PrBrief.safeParse(legacyBrief);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.review_focus).toEqual([]);
      expect(parsed.data.file_summaries).toEqual([]);
      expect(parsed.data.truncated).toBe(false);
      expect(parsed.data.summary).toBeUndefined();
      expect(parsed.data.merge_risk).toBeUndefined();
    }
  });

  it('PrBrief.safeParse accepts a document carrying all four legacy fields plus the new ones', () => {
    const parsed = PrBrief.safeParse(fullBrief);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.merge_risk).toBe('medium');
      expect(parsed.data.review_focus).toHaveLength(1);
      expect(parsed.data.file_summaries).toHaveLength(1);
      expect(parsed.data.cost_usd).toBe(0.05);
    }
  });

  it('PrBrief rejects a summary over 400 characters', () => {
    expect(PrBrief.safeParse({ ...fullBrief, summary: 'x'.repeat(401) }).success).toBe(false);
  });

  it('PrBriefGenerationState requires only status', () => {
    const parsed = PrBriefGenerationState.safeParse({
      status: 'running',
      provider: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      error: null,
      started_at: '2026-08-24T00:00:00.000Z',
      finished_at: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('PrBriefResponse accepts brief: null and a null generation', () => {
    const parsed = PrBriefResponse.safeParse({ brief: null, generation: null, stale: false });
    expect(parsed.success).toBe(true);
  });

  it('PrBriefResponse accepts a stored brief alongside a done generation', () => {
    const parsed = PrBriefResponse.safeParse({
      brief: fullBrief,
      generation: {
        status: 'done',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        tokens_in: 1200,
        tokens_out: 300,
        cost_usd: 0.05,
        error: null,
        started_at: '2026-08-24T00:00:00.000Z',
        finished_at: '2026-08-24T00:00:05.000Z',
      },
      stale: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Eval contracts — expectation list narrowing (AC-9) and nullable metrics', () => {
  const conformingExpectations = [
    {
      kind: 'must_find',
      file: 'src/config.ts',
      line: 12,
      end_line: 14,
      category: 'security',
      severity: 'CRITICAL',
      title_contains: 'secret',
    },
    {
      kind: 'must_not_flag',
      file: 'src/handlers/webhook.ts',
      line: 40,
      category: 'bug',
    },
  ];

  it('EvalCaseInput and EvalCase parse a conforming expectation list', () => {
    const input = EvalCaseInput.safeParse({
      owner_kind: 'agent',
      owner_id: 'a1',
      name: 'flags the hardcoded secret',
      input_diff: 'diff --git a/src/config.ts b/src/config.ts',
      expected_output: conformingExpectations,
    });
    expect(input.success).toBe(true);
    expect(input.success && input.data.expected_output).toHaveLength(2);

    const record = EvalCase.safeParse({
      id: 'c1',
      owner_kind: 'agent',
      owner_id: 'a1',
      name: 'flags the hardcoded secret',
      input_diff: 'diff --git a/src/config.ts b/src/config.ts',
      input_files: null,
      input_meta: null,
      expected_output: conformingExpectations,
    });
    expect(record.success).toBe(true);
  });

  it('EvalCaseInput and EvalCase reject a non-conforming expectation list', () => {
    const badKind = EvalCaseInput.safeParse({
      owner_kind: 'agent',
      owner_id: 'a1',
      name: 'bad kind',
      expected_output: [{ kind: 'must_maybe', file: 'a.ts', line: 1, category: 'bug' }],
    });
    expect(badKind.success).toBe(false);

    const missingLine = EvalCase.safeParse({
      id: 'c1',
      owner_kind: 'agent',
      owner_id: 'a1',
      name: 'missing line',
      input_diff: '',
      input_files: null,
      input_meta: null,
      expected_output: [{ kind: 'must_find', file: 'a.ts', category: 'bug' }],
    });
    expect(missingLine.success).toBe(false);
  });

  it('EvalCaseInput accepts an empty expectation list (AC-13)', () => {
    expect(
      EvalCaseInput.safeParse({
        owner_kind: 'skill',
        owner_id: 's1',
        name: 'asserts silence',
        expected_output: [],
      }).success,
    ).toBe(true);
  });

  it('EvalDashboard.current and .delta accept null for a never-run agent (AC-35, AC-36, AC-39)', () => {
    const parsed = EvalDashboard.safeParse({
      owner_kind: 'agent',
      owner_id: 'a1',
      cases_total: 3,
      current: {
        recall: null,
        precision: null,
        citation_accuracy: null,
        traces_passed: null,
        traces_total: 3,
        cost_usd: null,
      },
      delta: { recall: null, precision: null, citation_accuracy: null },
      trend: [],
      recent_runs: [],
      alert: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('EvalDashboard.delta accepts null for an agent with exactly one completed run (AC-40)', () => {
    const parsed = EvalDashboard.safeParse({
      owner_kind: 'agent',
      owner_id: 'a1',
      cases_total: 3,
      current: {
        recall: 0.5,
        precision: 1,
        citation_accuracy: 0.9,
        traces_passed: 2,
        traces_total: 3,
        cost_usd: 0.01,
      },
      delta: { recall: null, precision: null, citation_accuracy: null },
      trend: [],
      recent_runs: [],
      alert: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('EvalTrendPoint pins null recall/precision/citation_accuracy', () => {
    expect(
      EvalTrendPoint.safeParse({
        ran_at: '2026-08-24T00:00:00.000Z',
        recall: null,
        precision: null,
        citation_accuracy: null,
        pass_rate: 0,
        cost_usd: null,
      }).success,
    ).toBe(true);
  });

  it('knowledge.ts EvalRun pins null recall/precision/citation_accuracy', () => {
    expect(
      EvalRun.safeParse({
        recall: null,
        precision: null,
        citation_accuracy: null,
        traces_passed: 0,
        traces_total: 3,
        duration_ms: 500,
        cost_usd: null,
        per_trace: [],
      }).success,
    ).toBe(true);
  });
});

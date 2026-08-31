import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client.js';
import * as t from './schema.js';
import { EvalExpectation } from '../vendor/shared/contracts/knowledge.js';
import { SECURITY_REVIEWER_SSRF_LINE } from './seed-prompts.js';

export { SECURITY_REVIEWER_SSRF_LINE };

type EvalExpectationSeed = z.infer<typeof EvalExpectation>;

interface EvalCaseSeed {
  name: string;
  inputDiff: string;
  expectedOutput: EvalExpectationSeed[];
  notes?: string;
}

const evalExpectationArray = z.array(EvalExpectation);

const SSRF_PAIR_NOTE = `Outcome depends on this line of SECURITY_REVIEWER_PROMPT: ${SECURITY_REVIEWER_SSRF_LINE.trim()}`;

export const SECURITY_REVIEWER_EVAL_CASES: EvalCaseSeed[] = [
  {
    name: 'Hardcoded provider secret key in config',
    inputDiff: `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -8,2 +8,3 @@
  databaseUrl: process.env.DATABASE_URL,
+  stripeSecretKey: 'sk_live_xxx',
  cloneDir: process.env.CLONE_DIR ?? '/var/data/clones',
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/config.ts',
        line: 9,
        end_line: 9,
        category: 'security',
        severity: 'CRITICAL',
        title_contains: 'secret',
      },
    ],
  },
  {
    name: 'SQL injection via string interpolation in ledger query',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -22,2 +22,3 @@
 export async function findLedgerEntriesByMerchant(db: Db, merchantId: string) {
+  return db.query(\`SELECT * FROM ledger_entries WHERE merchant_id = '\${merchantId}'\`);
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/ledger/query.ts',
        line: 23,
        end_line: 23,
        category: 'security',
        severity: 'CRITICAL',
        title_contains: 'SQL',
      },
    ],
  },
  {
    name: 'Missing merchant ownership check on invoice lookup',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -16,2 +16,3 @@
  const invoice = await db.invoices.findById(invoiceId);
+  return res.json(invoice);
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 17,
        end_line: 17,
        category: 'security',
        severity: 'CRITICAL',
        title_contains: 'ownership',
      },
    ],
  },
  {
    name: 'Parameterized ledger currency query is not SQL injection',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -30,2 +30,3 @@
 export async function findLedgerEntriesByCurrency(db: Db, currency: string) {
+  return db.query('SELECT * FROM ledger_entries WHERE currency = $1', [currency]);
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/ledger/query.ts',
        line: 31,
        end_line: 31,
        category: 'security',
        title_contains: 'SQL',
      },
    ],
  },
  {
    name: 'SSRF via unvalidated merchant callback URL',
    inputDiff: `diff --git a/src/gateway/webhookRelay.ts b/src/gateway/webhookRelay.ts
--- a/src/gateway/webhookRelay.ts
+++ b/src/gateway/webhookRelay.ts
@@ -11,2 +11,3 @@
 export async function relayWebhookToMerchant(req: Request) {
+  return fetch(req.body.callback_url, { method: 'POST', body: req.rawBody });
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/gateway/webhookRelay.ts',
        line: 12,
        end_line: 12,
        category: 'security',
        severity: 'CRITICAL',
        title_contains: 'SSRF',
      },
    ],
    notes: SSRF_PAIR_NOTE,
  },
  {
    name: 'Fixed-URL gateway health check is not SSRF',
    inputDiff: `diff --git a/src/gateway/metrics.ts b/src/gateway/metrics.ts
--- a/src/gateway/metrics.ts
+++ b/src/gateway/metrics.ts
@@ -6,2 +6,3 @@
 export async function pingCardNetwork() {
+  return fetch(CARD_NETWORK_HEALTH_URL, { method: 'GET' });
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/gateway/metrics.ts',
        line: 7,
        end_line: 7,
        category: 'security',
        title_contains: 'SSRF',
      },
    ],
    notes: SSRF_PAIR_NOTE,
  },
  {
    name: 'Session token generated with Math.random instead of a CSPRNG',
    inputDiff: `diff --git a/src/api/public/sessions.ts b/src/api/public/sessions.ts
--- a/src/api/public/sessions.ts
+++ b/src/api/public/sessions.ts
@@ -20,2 +20,3 @@
 export function createLegacySessionToken(userId: string) {
+  return Math.random().toString(36).slice(2);
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/sessions.ts',
        line: 21,
        end_line: 21,
        category: 'security',
        severity: 'WARNING',
        title_contains: 'random',
      },
    ],
  },
  {
    name: 'Extracting merchant header into a local variable is not a security issue',
    inputDiff: `diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts
--- a/src/middleware/ratelimit.ts
+++ b/src/middleware/ratelimit.ts
@@ -32,2 +32,3 @@
 export function bucketKey(req: Request) {
+  const merchantId = req.headers['x-merchant-id'];
   return \`bucket:\${merchantId}\`;
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/middleware/ratelimit.ts',
        line: 33,
        end_line: 33,
        category: 'security',
      },
    ],
  },
];

export const PERFORMANCE_REVIEWER_EVAL_CASES: EvalCaseSeed[] = [
  {
    name: 'N+1 ledger query inside a map over invoices',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -40,3 +40,9 @@
 export async function listInvoiceLedgerRows(merchantId: string) {
   const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.merchantId, merchantId));
+  const rows = await Promise.all(
+    invoices.map((invoice) =>
+      db.select().from(ledgerEntries).where(eq(ledgerEntries.invoiceId, invoice.id)),
+    ),
+  );
+  return rows.flat();
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 42,
        end_line: 47,
        category: 'perf',
        severity: 'WARNING',
        title_contains: 'N+1',
      },
    ],
  },
  {
    name: 'Transaction held open across an outbound webhook call',
    inputDiff: `diff --git a/src/gateway/webhookRelay.ts b/src/gateway/webhookRelay.ts
--- a/src/gateway/webhookRelay.ts
+++ b/src/gateway/webhookRelay.ts
@@ -30,3 +30,8 @@
 export async function settleAndNotify(entryId: string) {
   return db.transaction(async (tx) => {
+    await tx.update(ledgerEntries).set({ status: 'settled' }).where(eq(ledgerEntries.id, entryId));
+    const merchant = await tx.select().from(merchants).where(eq(merchants.entryId, entryId));
+    await fetch(merchant.callbackUrl, { method: 'POST', body: JSON.stringify({ entryId }) });
+    await tx.insert(webhookDeliveries).values({ entryId, deliveredAt: new Date() });
+  });
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/gateway/webhookRelay.ts',
        line: 34,
        end_line: 34,
        category: 'perf',
        severity: 'WARNING',
        title_contains: 'transaction',
      },
    ],
  },
  {
    name: 'Merchant filter ordered by created_at with no supporting index',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -40,2 +40,7 @@
 export async function recentEntriesForMerchant(merchantId: string) {
+  return db
+    .select()
+    .from(ledgerEntries)
+    .where(eq(ledgerEntries.merchantId, merchantId))
+    .orderBy(desc(ledgerEntries.createdAt));
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/ledger/query.ts',
        line: 41,
        end_line: 45,
        category: 'perf',
        severity: 'WARNING',
        title_contains: 'index',
      },
    ],
  },
  {
    name: 'Unbounded SELECT * loads the whole ledger on a list endpoint',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -60,2 +60,4 @@
 export async function exportLedgerForMerchant(merchantId: string, res: Response) {
+  const entries = await db.query('SELECT * FROM ledger_entries WHERE merchant_id = $1', [merchantId]);
+  return res.json({ entries });
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 61,
        end_line: 62,
        category: 'perf',
        severity: 'WARNING',
        title_contains: 'limit',
      },
    ],
  },
  {
    name: 'Same invoice lookup issued twice in one handler',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -80,3 +80,6 @@
 export async function invoiceSummary(invoiceId: string) {
   const invoice = await db.invoices.findById(invoiceId);
+  const merchant = await db.merchants.findById(invoice.merchantId);
+  const total = await db.invoices.findById(invoiceId);
+  return { invoice, merchant, amount: total.amount };
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 83,
        end_line: 83,
        category: 'perf',
        severity: 'SUGGESTION',
      },
    ],
  },
  {
    name: 'In-memory map over already-loaded invoices is not an N+1',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -100,2 +100,6 @@
 export function invoiceLineTotals(invoices: Invoice[]) {
+  return invoices.map((invoice) => ({
+    id: invoice.id,
+    total: invoice.lines.reduce((sum, line) => sum + line.amount, 0),
+  }));
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/api/public/invoices.ts',
        line: 101,
        end_line: 101,
        category: 'perf',
        title_contains: 'N+1',
      },
    ],
  },
  {
    name: 'Short transaction around two ledger writes is not pool starvation',
    inputDiff: `diff --git a/src/gateway/webhookRelay.ts b/src/gateway/webhookRelay.ts
--- a/src/gateway/webhookRelay.ts
+++ b/src/gateway/webhookRelay.ts
@@ -50,3 +50,6 @@
 export async function markRelayDelivered(entryId: string) {
   return db.transaction(async (tx) => {
+    await tx.update(webhookDeliveries).set({ status: 'delivered' }).where(eq(webhookDeliveries.entryId, entryId));
+    await tx.update(ledgerEntries).set({ notifiedAt: new Date() }).where(eq(ledgerEntries.id, entryId));
+  });
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/gateway/webhookRelay.ts',
        line: 53,
        end_line: 53,
        category: 'perf',
        title_contains: 'transaction',
      },
    ],
  },
  {
    name: 'Limited read of the small feature-flag table is not an unbounded query',
    inputDiff: `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -30,2 +30,4 @@
 export async function loadFeatureFlags() {
+  const rows = await db.select().from(featureFlags).limit(50);
+  return Object.fromEntries(rows.map((row) => [row.key, row.enabled]));
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/config.ts',
        line: 31,
        end_line: 32,
        category: 'perf',
        title_contains: 'limit',
      },
    ],
  },
];

export const API_CONTRACT_REVIEWER_EVAL_CASES: EvalCaseSeed[] = [
  {
    name: 'Response field dropped from the invoice DTO',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -12,6 +12,5 @@
 export function toInvoiceDto(invoice: Invoice) {
   return {
     id: invoice.id,
-    legacy_reference: invoice.legacyReference,
     amount_cents: invoice.amountCents,
   };
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 15,
        end_line: 15,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'removed',
      },
    ],
  },
  {
    name: 'Optional request field made required on session creation',
    inputDiff: `diff --git a/src/api/public/sessions.ts b/src/api/public/sessions.ts
--- a/src/api/public/sessions.ts
+++ b/src/api/public/sessions.ts
@@ -8,4 +8,4 @@
 export const CreateSessionRequest = z.object({
   merchant_id: z.string(),
-  device_id: z.string().optional(),
+  device_id: z.string(),
 });
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/sessions.ts',
        line: 10,
        end_line: 10,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'required',
      },
    ],
  },
  {
    name: 'Void invoice switched from 200 with a body to 204 with none',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -30,4 +30,4 @@
 export async function voidInvoice(req: Request, res: Response) {
   const invoice = await db.invoices.void(req.params.id);
-  return res.status(200).json(invoice);
+  return res.status(204).send();
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 32,
        end_line: 32,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: '204',
      },
    ],
  },
  {
    name: 'Enum member removed from the shared invoice status contract',
    inputDiff: `diff --git a/src/vendor/shared/contracts.ts b/src/vendor/shared/contracts.ts
--- a/src/vendor/shared/contracts.ts
+++ b/src/vendor/shared/contracts.ts
@@ -4,6 +4,5 @@
 export const InvoiceStatus = z.enum([
   'draft',
   'open',
-  'uncollectible',
   'paid',
 ]);
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/vendor/shared/contracts.ts',
        line: 7,
        end_line: 7,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'enum',
      },
    ],
  },
  {
    name: 'Invoice route path renamed with no alias for existing callers',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -50,3 +50,3 @@
 export function registerInvoiceRoutes(app: App) {
-  app.get('/v1/invoices/:id', getInvoice);
+  app.get('/v1/billing/invoices/:id', getInvoice);
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 51,
        end_line: 51,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'route',
      },
    ],
  },
  {
    name: 'Optional response field added to the invoice summary DTO',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -70,4 +70,5 @@
 export function toInvoiceSummaryDto(invoice: Invoice) {
   return {
     id: invoice.id,
+    settled_at: invoice.settledAt ?? null,
   };
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/api/public/invoices.ts',
        line: 73,
        end_line: 73,
        category: 'bug',
        title_contains: 'added',
      },
    ],
  },
  {
    name: 'Brand-new receipt route added alongside the existing ones',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -90,2 +90,3 @@
 export function registerInvoiceExportRoutes(app: App) {
+  app.get('/v1/invoices/:id/receipt', getInvoiceReceipt);
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/api/public/invoices.ts',
        line: 91,
        end_line: 91,
        category: 'bug',
        title_contains: 'route',
      },
    ],
  },
  {
    name: 'Internal helper signature widened with its only call site updated',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -60,3 +60,3 @@
-function buildEntryFilter(merchantId: string) {
-  return { merchantId };
+function buildEntryFilter(merchantId: string, includeVoided: boolean) {
+  return { merchantId, includeVoided };
 }
diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -110,3 +110,3 @@
 export async function listEntries(merchantId: string) {
-  return findEntries(buildEntryFilter(merchantId));
+  return findEntries(buildEntryFilter(merchantId, false));
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/ledger/query.ts',
        line: 60,
        end_line: 61,
        category: 'bug',
        title_contains: 'signature',
      },
    ],
  },
];

export const TEST_QUALITY_REVIEWER_EVAL_CASES: EvalCaseSeed[] = [
  {
    name: 'Tautological absence assertions for roles the table never renders',
    inputDiff: `diff --git a/src/ui/InvoiceTable.test.tsx b/src/ui/InvoiceTable.test.tsx
--- a/src/ui/InvoiceTable.test.tsx
+++ b/src/ui/InvoiceTable.test.tsx
@@ -20,4 +20,7 @@
 it('renders the invoice rows', () => {
   render(<InvoiceTable invoices={invoices} />);
   expect(screen.getByRole('table')).toBeInTheDocument();
+  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
+  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
+  expect(screen.queryByRole('menubar')).not.toBeInTheDocument();
 });
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/ui/InvoiceTable.test.tsx',
        line: 23,
        end_line: 25,
        category: 'test',
        severity: 'WARNING',
        title_contains: 'assertion',
      },
    ],
  },
  {
    name: 'Rate-limit bypass added with no test change anywhere in the diff',
    inputDiff: `diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts
--- a/src/middleware/ratelimit.ts
+++ b/src/middleware/ratelimit.ts
@@ -12,3 +12,5 @@
 export function allow(req: Request) {
   const bucket = buckets.get(bucketKey(req));
+  if (req.headers['x-internal-service'] === 'true') return true;
+  if (!bucket) return true;
   return bucket.tokens > 0;
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/middleware/ratelimit.ts',
        line: 14,
        end_line: 15,
        category: 'test',
        severity: 'WARNING',
        title_contains: 'test',
      },
    ],
  },
  {
    name: 'Ledger assertion weakened from toEqual to toBeDefined',
    inputDiff: `diff --git a/src/ledger/query.test.ts b/src/ledger/query.test.ts
--- a/src/ledger/query.test.ts
+++ b/src/ledger/query.test.ts
@@ -30,4 +30,4 @@
 it('returns the merchant ledger entries', async () => {
   const entries = await findLedgerEntriesByMerchant(db, 'merch_1');
-  expect(entries).toEqual([{ id: 'le_1', amount_cents: 4200 }]);
+  expect(entries).toBeDefined();
 });
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/ledger/query.test.ts',
        line: 32,
        end_line: 32,
        category: 'test',
        severity: 'WARNING',
        title_contains: 'assertion',
      },
    ],
  },
  {
    name: 'New test passes with the added large-sample branch reverted',
    inputDiff: `diff --git a/src/gateway/metrics.ts b/src/gateway/metrics.ts
--- a/src/gateway/metrics.ts
+++ b/src/gateway/metrics.ts
@@ -20,3 +20,4 @@
 export function summarize(samples: number[]) {
   if (samples.length === 0) return 0;
+  if (samples.length > 1000) return median(samples);
   return samples.reduce((a, b) => a + b, 0) / samples.length;
diff --git a/src/gateway/metrics.test.ts b/src/gateway/metrics.test.ts
--- a/src/gateway/metrics.test.ts
+++ b/src/gateway/metrics.test.ts
@@ -10,2 +10,5 @@
 describe('summarize', () => {
+  it('averages a small sample', () => {
+    expect(summarize([2, 4])).toBe(3);
+  });
 });
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/gateway/metrics.test.ts',
        line: 11,
        end_line: 13,
        category: 'test',
        severity: 'WARNING',
        title_contains: 'test',
      },
    ],
  },
  {
    name: 'Bucket-key fallback test deleted with no replacement',
    inputDiff: `diff --git a/src/middleware/ratelimit.test.ts b/src/middleware/ratelimit.test.ts
--- a/src/middleware/ratelimit.test.ts
+++ b/src/middleware/ratelimit.test.ts
@@ -18,9 +18,5 @@
 describe('bucketKey', () => {
   it('uses the merchant header when present', () => {
     expect(bucketKey({ headers: { 'x-merchant-id': 'm_1' } })).toBe('bucket:m_1');
   });
-
-  it('falls back to the ip when the merchant header is absent', () => {
-    expect(bucketKey({ headers: {} })).toBe('bucket:ip:127.0.0.1');
-  });
 });
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/middleware/ratelimit.test.ts',
        line: 21,
        end_line: 22,
        category: 'test',
        severity: 'WARNING',
        title_contains: 'test',
      },
    ],
  },
  {
    name: 'Currency test renamed with its assertions untouched',
    inputDiff: `diff --git a/src/ledger/query.test.ts b/src/ledger/query.test.ts
--- a/src/ledger/query.test.ts
+++ b/src/ledger/query.test.ts
@@ -40,4 +40,4 @@
 describe('findLedgerEntriesByCurrency', () => {
-  it('returns entries for the currency', async () => {
+  it('returns only the entries matching the requested currency', async () => {
     const entries = await findLedgerEntriesByCurrency(db, 'usd');
     expect(entries).toEqual([{ id: 'le_2', currency: 'usd' }]);
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/ledger/query.test.ts',
        line: 41,
        end_line: 41,
        category: 'test',
        title_contains: 'assertion',
      },
    ],
  },
  {
    name: 'Absence assertion paired with a positive assertion in the empty state',
    inputDiff: `diff --git a/src/ui/InvoiceTable.test.tsx b/src/ui/InvoiceTable.test.tsx
--- a/src/ui/InvoiceTable.test.tsx
+++ b/src/ui/InvoiceTable.test.tsx
@@ -40,3 +40,6 @@
 it('shows the empty state when there are no invoices', () => {
   render(<InvoiceTable invoices={[]} />);
+  expect(screen.getByRole('status')).toHaveTextContent('No invoices yet');
+  expect(screen.queryByRole('table')).not.toBeInTheDocument();
+  expect(screen.getByRole('button', { name: 'Import invoices' })).toBeEnabled();
 });
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/ui/InvoiceTable.test.tsx',
        line: 43,
        end_line: 43,
        category: 'test',
        title_contains: 'assertion',
      },
    ],
  },
  {
    name: 'Session test setup extracted into a helper with assertions unchanged',
    inputDiff: `diff --git a/src/api/public/sessions.test.ts b/src/api/public/sessions.test.ts
--- a/src/api/public/sessions.test.ts
+++ b/src/api/public/sessions.test.ts
@@ -12,7 +12,7 @@
 describe('createSession', () => {
+  const setup = () => buildSessionFixture({ merchantId: 'm_1', deviceId: 'd_1' });
+
   it('returns a session for the merchant', async () => {
-    const merchantId = 'm_1';
-    const deviceId = 'd_1';
-    const fixture = buildSessionFixture({ merchantId, deviceId });
+    const fixture = setup();
     const session = await createSession(fixture);
     expect(session.merchant_id).toBe('m_1');
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/api/public/sessions.test.ts',
        line: 13,
        end_line: 16,
        category: 'test',
        title_contains: 'coverage',
      },
    ],
  },
];

export const GENERAL_REVIEWER_EVAL_CASES: EvalCaseSeed[] = [
  {
    name: 'Logical OR fallback swallows a configured retry budget of zero',
    inputDiff: `diff --git a/src/gateway/metrics.ts b/src/gateway/metrics.ts
--- a/src/gateway/metrics.ts
+++ b/src/gateway/metrics.ts
@@ -30,3 +30,4 @@
 export function relayAttempts(merchant: Merchant) {
   const configured = merchant.settings.maxRetries;
+  return configured || DEFAULT_MAX_RETRIES;
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/gateway/metrics.ts',
        line: 32,
        end_line: 32,
        category: 'bug',
        severity: 'WARNING',
      },
    ],
  },
  {
    name: 'Delivery insert not awaited, leaving the rejection unhandled',
    inputDiff: `diff --git a/src/gateway/webhookRelay.ts b/src/gateway/webhookRelay.ts
--- a/src/gateway/webhookRelay.ts
+++ b/src/gateway/webhookRelay.ts
@@ -70,3 +70,4 @@
 export async function recordDelivery(entryId: string) {
   const payload = buildPayload(entryId);
+  db.insert(webhookDeliveries).values(payload);
   return payload;
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/gateway/webhookRelay.ts',
        line: 72,
        end_line: 72,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'await',
      },
    ],
  },
  {
    name: 'forEach with an async callback does not wait for the reconciliation',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -70,3 +70,6 @@
 export async function reconcileEntries(entryIds: string[]) {
+  entryIds.forEach(async (entryId) => {
+    await db.update(ledgerEntries).set({ reconciled: true }).where(eq(ledgerEntries.id, entryId));
+  });
   return { reconciled: entryIds.length };
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/ledger/query.ts',
        line: 71,
        end_line: 73,
        category: 'bug',
        severity: 'CRITICAL',
        title_contains: 'forEach',
      },
    ],
  },
  {
    name: 'Pagination slice overlaps the next page by one invoice',
    inputDiff: `diff --git a/src/api/public/invoices.ts b/src/api/public/invoices.ts
--- a/src/api/public/invoices.ts
+++ b/src/api/public/invoices.ts
@@ -130,3 +130,3 @@
 export function pageSlice(invoices: Invoice[], page: number, size: number) {
-  return invoices.slice(page * size, page * size + size);
+  return invoices.slice(page * size, page * size + size + 1);
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/invoices.ts',
        line: 131,
        end_line: 131,
        category: 'bug',
        severity: 'WARNING',
        title_contains: 'off-by-one',
      },
    ],
  },
  {
    name: 'Empty catch block hides a failed session revocation from the caller',
    inputDiff: `diff --git a/src/api/public/sessions.ts b/src/api/public/sessions.ts
--- a/src/api/public/sessions.ts
+++ b/src/api/public/sessions.ts
@@ -40,2 +40,6 @@
 export async function revokeSession(sessionId: string) {
+  try {
+    await db.sessions.revoke(sessionId);
+  } catch {}
+  return { revoked: true };
 }
`,
    expectedOutput: [
      {
        kind: 'must_find',
        file: 'src/api/public/sessions.ts',
        line: 43,
        end_line: 43,
        category: 'bug',
        severity: 'WARNING',
        title_contains: 'error',
      },
    ],
  },
  {
    name: 'Nullish coalescing keeps a configured window of zero seconds',
    inputDiff: `diff --git a/src/gateway/metrics.ts b/src/gateway/metrics.ts
--- a/src/gateway/metrics.ts
+++ b/src/gateway/metrics.ts
@@ -50,3 +50,4 @@
 export function sampleWindow(merchant: Merchant) {
   const configured = merchant.settings.windowSeconds;
+  return configured ?? DEFAULT_WINDOW_SECONDS;
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/gateway/metrics.ts',
        line: 52,
        end_line: 52,
        category: 'bug',
      },
    ],
  },
  {
    name: 'Fire-and-forget retry enqueue has its rejection handled',
    inputDiff: `diff --git a/src/gateway/webhookRelay.ts b/src/gateway/webhookRelay.ts
--- a/src/gateway/webhookRelay.ts
+++ b/src/gateway/webhookRelay.ts
@@ -90,2 +90,5 @@
 export function scheduleRetry(entryId: string) {
+  retryQueue
+    .enqueue(entryId)
+    .catch((err) => logger.error({ err, entryId }, 'retry enqueue failed'));
   return { scheduled: true };
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/gateway/webhookRelay.ts',
        line: 91,
        end_line: 93,
        category: 'bug',
        title_contains: 'await',
      },
    ],
  },
  {
    name: 'Sequential for-of with await applies ledger entries in order',
    inputDiff: `diff --git a/src/ledger/query.ts b/src/ledger/query.ts
--- a/src/ledger/query.ts
+++ b/src/ledger/query.ts
@@ -90,3 +90,6 @@
 export async function applyEntriesInOrder(entries: LedgerEntry[]) {
+  for (const entry of entries) {
+    await db.insert(ledgerEntries).values(entry);
+  }
   return entries.length;
 }
`,
    expectedOutput: [
      {
        kind: 'must_not_flag',
        file: 'src/ledger/query.ts',
        line: 91,
        end_line: 93,
        category: 'bug',
        title_contains: 'await',
      },
    ],
  },
];

export const EVAL_CASE_SETS_BY_AGENT_NAME: ReadonlyMap<string, EvalCaseSeed[]> = new Map([
  ['General Reviewer', GENERAL_REVIEWER_EVAL_CASES],
  ['Security Reviewer', SECURITY_REVIEWER_EVAL_CASES],
  ['Performance Reviewer', PERFORMANCE_REVIEWER_EVAL_CASES],
  ['Test Quality Reviewer', TEST_QUALITY_REVIEWER_EVAL_CASES],
  ['API Contract Reviewer', API_CONTRACT_REVIEWER_EVAL_CASES],
]);

export async function seedEvalCases(
  db: Db,
  params: { workspaceId: string; agentId: string; cases: EvalCaseSeed[] },
): Promise<void> {
  const { workspaceId, agentId, cases } = params;
  for (const def of cases) {
    const expectedOutput = evalExpectationArray.parse(def.expectedOutput);
    const [existing] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
          eq(t.evalCases.name, def.name),
        ),
      );
    if (existing) continue;
    await db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: def.name,
      inputDiff: def.inputDiff,
      expectedOutput,
      notes: def.notes ?? null,
      sourceFindingId: null,
    });
  }
}

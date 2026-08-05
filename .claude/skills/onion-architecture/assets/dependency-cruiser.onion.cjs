/**
 * Onion Architecture boundaries for @devdigest/api.
 *
 * Copy to server/.dependency-cruiser.cjs and run:
 *   npx depcruise --config .dependency-cruiser.cjs src
 *
 * severity "error" — the rule as it applies to new code. A clean tree has zero.
 * severity "warn"  — a pre-existing violation, deliberately visible rather than
 *                    silenced. Each names its section in
 *                    .claude/skills/onion-architecture/references/migration.md.
 *
 * Rings: 0 contracts + pure core · 1 domain · 2 use case · 3 infrastructure ·
 *        4 delivery + composition. Source dependencies point inward only.
 */

const RING_3 = [
  '^src/db/',
  '^src/adapters/',
  '^src/platform/jobs\\.ts$',
  '^src/modules/[^/]+/repository\\.ts$',
  '^src/modules/[^/]+/repository/',
];

const COMPOSITION_ROOT = [
  '^src/app\\.ts$',
  '^src/server\\.ts$',
  '^src/platform/container\\.ts$',
  '^src/modules/[^/]+/routes\\.ts$',
];

const DRIZZLE_OR_SCHEMA = 'node_modules/drizzle-orm|^src/db/schema';

const LEGACY = {
  fatRoutes: [
    '^src/modules/pulls/routes\\.ts$',
    '^src/modules/settings/routes\\.ts$',
    '^src/modules/settings/feature-models\\.ts$',
    '^src/modules/polling/routes\\.ts$',
    '^src/modules/workspace/routes\\.ts$',
  ],
  schemaTypes: [
    '^src/modules/repos/helpers\\.ts$',
    '^src/modules/reviews/diff-loader\\.ts$',
    '^src/modules/reviews/run-executor\\.ts$',
  ],
  crossSlice: ['^src/modules/repos/service\\.ts$'],
  adaptersToModules: ['^src/adapters/astgrep/', '^src/adapters/depgraph/'],
};

module.exports = {
  forbidden: [
    {
      name: 'ring-1-domain-stays-pure',
      severity: 'error',
      comment:
        'Ring 1 (domain.ts, ports.ts) may import ring 0 contracts, zod, and its own ' +
        'slice constants — not Drizzle, Fastify, adapters or the container. A rule ' +
        'that names infrastructure cannot outlive it. See references/rings.md.',
      from: { path: '^src/modules/[^/]+/(domain|ports)\\.ts$' },
      to: {
        pathNot: [
          '^src/vendor/shared',
          '^src/modules/[^/]+/(domain|ports|constants)\\.ts$',
          'node_modules/zod',
        ],
      },
    },
    {
      name: 'ring-0-contracts-stay-pure',
      severity: 'error',
      comment:
        'vendor/shared is ring 0 — Zod contracts and port interfaces shared with ' +
        'client/ and reviewer-core/. It may depend on zod and itself, nothing else.',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: ['^src/vendor/shared/', 'node_modules/zod'] },
    },
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'reviewer-core is ring 0 and must run without the server; everything ' +
        'external arrives injected. See reviewer-core/CLAUDE.md.',
      from: { path: '/reviewer-core/src/' },
      to: { path: '^src/(app\\.ts|server\\.ts|adapters/|db/|modules/|platform/)' },
    },
    {
      name: 'ring-2-service-not-to-framework',
      severity: 'error',
      comment:
        'Fastify is the delivery mechanism (ring 4). A use case that knows about ' +
        'req/reply cannot be called by a job, a CLI or a test. See references/fastify.md.',
      from: { path: '^src/modules/[^/]+/(service|domain|ports|helpers)\\.ts$' },
      to: {
        path: 'node_modules/(fastify|@fastify|fastify-sse-v2|fastify-type-provider-zod)',
      },
    },
    {
      name: 'drizzle-only-in-ring-3',
      severity: 'error',
      comment:
        'Drizzle and db/schema belong to repositories and infrastructure. A query ' +
        'anywhere else removes the seam below HTTP, and a schema type anywhere else ' +
        're-couples the code to the migration. See references/persistence.md.',
      from: {
        pathNot: [
          ...RING_3,
          '^src/app\\.ts$',
          ...LEGACY.fatRoutes,
          ...LEGACY.schemaTypes,
        ],
      },
      to: { path: DRIZZLE_OR_SCHEMA },
    },
    {
      name: 'legacy-fat-routes',
      severity: 'warn',
      comment:
        'MIGRATION §1 — these handlers query Drizzle directly and have no service or ' +
        'repository beneath them. Extract repository.ts, then service.ts.',
      from: { path: LEGACY.fatRoutes },
      to: { path: DRIZZLE_OR_SCHEMA },
    },
    {
      name: 'legacy-schema-types-outside-ring-3',
      severity: 'warn',
      comment:
        'MIGRATION §5 — pure helpers and orchestration naming db/schema types. Use ' +
        'db/rows.ts or a slice-owned type instead.',
      from: { path: LEGACY.schemaTypes },
      to: { path: DRIZZLE_OR_SCHEMA },
    },
    {
      name: 'no-cross-slice-imports',
      severity: 'error',
      comment:
        'A slice does not reach into a sibling. Share through db/rows.ts, a ' +
        'container-held repository, or ring 0. See references/slice-anatomy.md.',
      from: { path: '^src/modules/([^/]+)/', pathNot: LEGACY.crossSlice },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'legacy-cross-slice-imports',
      severity: 'warn',
      comment:
        'MIGRATION §9 — job kinds are shared vocabulary and belong in ring 0 or ' +
        'modules/_shared, not in a sibling slice.',
      from: { path: LEGACY.crossSlice },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/repos/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'adapters-not-to-modules',
      severity: 'error',
      comment:
        'Adapters implement ring 0 ports. An adapter that knows a feature slice ' +
        'cannot be reused or swapped.',
      from: { path: '^src/adapters/', pathNot: LEGACY.adaptersToModules },
      to: { path: '^src/modules/' },
    },
    {
      name: 'legacy-adapters-to-modules',
      severity: 'warn',
      comment:
        'MIGRATION §9 — astgrep and depgraph read repo-intel constants. Those limits ' +
        'belong to the adapter or to ring 0.',
      from: { path: LEGACY.adaptersToModules },
      to: { path: '^src/modules/' },
    },
    {
      name: 'container-only-in-composition-root',
      severity: 'warn',
      comment:
        'MIGRATION §3 — a service that takes the container hides its dependencies and ' +
        'cannot be substituted. Declare ports instead. See references/wiring.md.',
      from: { pathNot: COMPOSITION_ROOT },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'platform-not-to-modules',
      severity: 'warn',
      comment:
        'MIGRATION §2 — platform/container.ts imports module repositories, so the ' +
        'arrow points outward. Move the construction to app.ts or let each slice ' +
        'publish its own decorator.',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'MIGRATION §2 and §5 — a cycle means the rings are not actually ordered. The ' +
        'existing ones all resolve when the container stops importing modules and ' +
        'helpers stop importing repository row types. Do not add new ones.',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};

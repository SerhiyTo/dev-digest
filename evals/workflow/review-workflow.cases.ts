import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 10 Claude sessions total.
 *   - 6 × trace     → 1 session each                      = 6
 *   - 2 × activation pair (positive + near-miss negative) = 4
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in. For a subagent expectation the evidence is the subagent RETURNING, not the Task
 * call being emitted — so a dispatch-bearing trace does wait out the nested subagent.
 * Every trace below pairs at most ONE doc-read anchor with ONE dispatch/skill anchor — never two
 * doc reads in the same session, which earlier iterations found to be flaky (the model commits to
 * exploring one and skips the other; see the routing-only cases above for that history).
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads server/CLAUDE.md AND pulls the architecture-reviewer",
    prompt:
      "У модулі server/ я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export " +
      "(віддає ревʼю як markdown). Спершу звірся з конвенціями роутів і валідації саме цього модуля " +
      "— прочитай документ, де вони описані. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/CLAUDE.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): two "Read When" rows at once -----------------------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc. One anchor doc keeps this a
    // deterministic routing check — asserting two docs in one session is inherently flaky. The anchor
    // is reviewer-core/README.md: reviewer-core/CLAUDE.md attributes the pipeline diagram to it, and
    // reviewer-core/docs/ is an empty placeholder (.gitkeep only).
    name: "pipeline task follows CLAUDE.md routing to the reviewer-core pipeline diagram",
    prompt:
      "Я збираюся змінити review pipeline у reviewer-core. Перш ніж торкатися коду — звірся з " +
      "настановами цього модуля щодо того, де описаний сам пайплайн і його діаграма, і прочитай той документ.",
    expectFilesRead: ["reviewer-core/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing -> the module's INSIGHTS --
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read the file, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: in the real repo, the discovery prompt reads INSIGHTS.md.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- trace (1 session): nested server/CLAUDE.md ("read INSIGHTS.md before starting work here")
  //     + root CLAUDE.md subagent routing, in ONE natural backend task. Two different assertion
  //     kinds (a doc read + a subagent dispatch) reinforcing one story — NOT two doc reads, which
  //     the cases above this comment already found to be flaky together.
  {
    kind: "trace",
    name: "server task reads server/INSIGHTS.md AND pulls security-auditor for a clone/index path",
    prompt:
      "Я хочу додати новий ендпоінт POST /repos/:id/reindex, який форсує повторну індексацію " +
      "репозиторію. Перш ніж проєктувати підхід, врахуй уроки з попередніх сесій саме в цьому " +
      "модулі (server/) — вони можуть містити важливий контекст. Коли матимеш підхід, ОБОВ'ЯЗКОВО " +
      "запусти сабагента security-auditor, щоб він перевірив шлях індексації на SSRF та command " +
      "injection — не рецензуй сам.",
    expectFilesRead: ["server/INSIGHTS.md"],
    expectSubagents: ["security-auditor"],
    maxTurns: 8,
  },

  // --- trace (1 session): same pattern, client/ — nested CLAUDE.md's INSIGHTS.md rule + the
  //     architecture-reviewer routing (its own description explicitly covers client/ placement).
  {
    kind: "trace",
    name: "client task reads client/INSIGHTS.md AND pulls architecture-reviewer for placement",
    prompt:
      "Хочу додати нову сторінку в client/, яка показує статистику по findings за весь час. Перш " +
      "ніж проєктувати компоненти, врахуй уроки з попередніх сесій саме в цьому модулі (client/). " +
      "Коли матимеш план розміщення файлів і потоку даних, ОБОВ'ЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив розміщення коду — не рецензуй сам.",
    expectFilesRead: ["client/INSIGHTS.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): e2e/CLAUDE.md routes to e2e/README.md's flow format BEFORE writing a
  //     new flow — single anchor doc, same minimal shape as the INSIGHTS.md case above.
  {
    kind: "trace",
    name: "e2e task follows e2e/CLAUDE.md routing to README.md before adding a flow",
    prompt:
      "Хочу додати новий e2e-флоу в e2e/, який перевіряє сортування списку PR за датою. Перш ніж " +
      "писати команди, звірся з форматом флоу в цьому модулі — прочитай той документ.",
    expectFilesRead: ["e2e/README.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): deprecation-policy on a shared-contract field removal -----
  // `grounding` is a REAL field on ReviewRecord (server/src/vendor/shared/contracts/review-api.ts)
  // — a fabricated field name (first attempt: legacyReviewerModel) sent the model hunting for it
  // across the repo instead of acting, burning the whole turn budget on search with no verdict
  // either way. Removal targets must be real, unlike the case-1 endpoint (which must NOT exist).
  {
    kind: "activation",
    name: "deprecation-policy activates on removing a vendor/shared contract field",
    prompt:
      "Хочу прибрати поле grounding з Zod-контракту ReviewRecord у " +
      "server/src/vendor/shared/contracts/review-api.ts — ним більше ніхто не користується, " +
      "це старий артефакт.",
    skill: "deprecation-policy",
    shouldActivate: true,
    maxTurns: 8,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same field must NOT trigger deprecation-policy",
    prompt:
      "Поясни, для чого існує поле grounding у Zod-контракті ReviewRecord і чи хтось ним досі користується.",
    skill: "deprecation-policy",
    shouldActivate: false,
    maxTurns: 8,
  },
];

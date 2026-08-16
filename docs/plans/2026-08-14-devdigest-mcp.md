# Development Plan — `mcp/` (`@devdigest/mcp`), локальний stdio MCP-сервер

## Context

DevDigest уміє імпортувати PR, ганяти на них агентів-рев'юверів, зберігати findings і
витягати conventions — але тільки через веб-студію на :3000. Треба тонкий локальний
адаптер, щоб цим можна було користуватись прямо з Claude Code.

Це вже в роадмапі курсу: `README.md:85` — **L04: `devdigest-mcp` server · Blast Radius**.
Ця ітерація будує першу половину. Blast Radius виїжджає як **оголошена заглушка**, щоб
поверхня інструментів була фінальною вже зараз, а L04 змінив лише тіло однієї функції.

Результат: із запущеним `server/`, `/mcp` у Claude Code показує `devdigest` з пʼятьма
інструментами, а прохання «переглянь PR 42 в acme/api агентом Security» повертає
структуровані findings **за один виклик інструмента**.

---

## Чотири принципи дизайну → конкретний механізм

Це хребет плану. Кожен принцип має файл, у якому його можна перевірити.

| # | Принцип | Механізм |
|---|---|---|
| **1** | **Результат, а не операція** | `run_agent_on_pr` робить усі три кроки в одному виклику: `POST /pulls/:id/review` → `waitForRun()` (`src/review/wait.ts`) → композиція `GET /pulls/:id/runs` + `GET /pulls/:id/reviews`. Щасливий шлях повертає `{verdict, score, findings[]}`. Голий `run_id` — **тільки fallback при вичерпанні бюджету очікування**, і навіть тоді він несе точний наступний виклик. |
| **2** | **Плоскі аргументи** | Кожна вхідна схема — плоский `ZodRawShape` з примітивів: `repo: string`, `pr: number`, `agent: string`, `run_id?: string`, `min_severity?: enum(3)`, `limit?: number`. Жодних вкладених обʼєктів, жодного упакованого `"owner/repo#42"`. Ціна плоскості — резолвер (`src/resolve/refs.ts`), який перетворює ці примітиви на uuid, яких насправді хоче API. Цю ціну платить сервер, не модель. |
| **3** | **Стисла структурована відповідь** | Один `text`-блок із компактним `JSON.stringify` (без відступів). Finding проєктується на пʼять полів — `severity, file, line, title, fix` — відкидаючи `id`, `category`, `confidence`, `rationale`, `kind`, `evidence`, `review_id`, `accepted_at`, `dismissed_at`. Усі відповіді всіх інструментів проходять через єдиний `capPayload()` у `src/format/compact.ts`, жорсткий кеп 6000 символів. **Без `outputSchema`** (коштував би контексту без споживача) і без `structuredContent`. |
| **4** | **Помилка веде далі** | Один модуль `src/format/errors.ts` володіє всією таксономією. Кожне повідомлення закінчується *наступним викликом* або *наступною дією*, ніколи — сухим статусом. 13 ситуацій, по одній експортованій функції на кожну, тексти в одному місці й під снапшот-тестами. Нетермінальні стани (`running`, `failed`, вичерпаний бюджет) повертають `isError: false` — бо `isError: true` читається моделлю як «цей шлях мертвий». |

---

## Архітектура

```
Claude Code ──stdio (JSON-RPC)──▶ mcp/ (@devdigest/mcp) ──HTTP──▶ server/ :3001 ──▶ Postgres
                                  5 tools · resolver · wait · format
```

Сервер — **клієнт запущеного Fastify API**, а не другий вхід у домен. Ходить у
`DEVDIGEST_API_URL` (типово `http://localhost:3001`), не торкається БД, і в рантаймі не
імпортує нічого з `server/src` — лише типи, через аліас `@devdigest/shared`.

### Кільця (за скілом `onion-architecture`)

| Кільце | Що | Файли в `mcp/` |
|---|---|---|
| 0 | Контракти й чиста серцевина | `@devdigest/shared` (імпорт), `blast/contract.ts` |
| 1 | Домен і порти | `ports.ts` (`DevDigestApi`), `domain/select.ts` |
| 2 | Юзкейси | `tools/*.ts` — резолвлять, кличуть порт, віддають форматеру |
| 3 | Інфраструктура | `http/client.ts`, `http/schemas.ts`, `resolve/cache.ts` |
| 4 | Доставка й композиція | `server.ts`, `index.ts`, `tools/registry.ts` |

Перевірка, яка вирішує будь-яку суперечку: **чи скомпілюються кільця 0–2, якщо видалити
`http/`?** Інструменти імпортують лише `ports.ts`, тож так — і це саме те, що дозволяє
інтеграційному тесту підміняти *порт*, а не HTTP.

**Порт оголошує споживач, не реалізація** (принцип 2 скіла): `DevDigestApi` живе поруч з
інструментами, `http/client.ts` його реалізує, і ніщо більше не імпортує тип клієнта.
`createServer(deps)` приймає порти — ніколи контейнер.

**`domain/select.ts`** — рішення з «тому що», які інакше розповзлися б по резолверу й
форматеру: порядок матчу репо (uuid → `full_name` → коротке імʼя), який прогін вважається
«тим самим» (найновіший `done`), впорядкування severity й семантика `min_severity`,
підбір найближчого імені агента для тексту помилки. Чисті функції, власні тести, без порту.
Один файл, не по `domain.ts` на кожну теку — кільце має заслужити своє місце.

**Локальна конвенція, яку легко проґавити:** відносні імпорти несуть суфікс `.js`
(`reviewer-core/src/review/run.ts:10`, `server/src/modules/reviews/service.ts:5`). `mcp/`
робить так само.

### Рішення, зафіксовані до старту

| Рішення | Чому |
|---|---|
| HTTP до :3001, без БД | Нуль дублювання логіки, не ламає межі onion-архітектури. `LocalNoAuthProvider` (`server/src/modules/_shared/context.ts:14`) не вимагає токенів. |
| SDK v1 `^1.30` + `zod ^3.24` | Увесь репо на zod 3. SDK v2 вимагає zod 4 — тоді неможливо типізуватись від vendored-контрактів. |
| Очікування 180с + progress-нотифікації, далі fallback на `run_id` | Прогрес-нотифікації скидають таймер клієнта. Принцип 1 виконано у >95% випадків без ризику зависнути. |
| Компактний JSON у `text`, без `outputSchema` | Структуровано й парситься, але схема не їсть контекст. |
| `agent` — обовʼязковий | Точно як на слайді: `run_agent_on_pr(repo, pr, agent)`. Один агент = одна відповідь. |
| Findings: усі рівні, `limit 20`, сортування від CRITICAL | Модель бачить повну картину; звужує через `min_severity`, коли забагато. |
| `failed` прогін → `isError: false` | Інструмент відпрацював коректно, збій прогону — це дані. Принцип 4. |

---

## Дисципліна токенів

Claude Code за замовчуванням **відкладає схеми MCP-інструментів** (`.claude/settings.json`
уже має `ENABLE_TOOL_SEARCH: true`). На старті сесії резидентні лише **імена 5 інструментів
+ `instructions`** ≈ **336 токенів**. Звідси вимоги, кожна з яких під тестом:

- `instructions` < 2048 символів (Claude Code ріже на 2KB), front-loaded, з крос-інструментальним
  флоу і граматикою refs — а не переказом описів інструментів.
- описи інструментів ≤ 320 символів;
- плоскі схеми, без `outputSchema`, без глибокої вкладеності й великих enum;
- детермінований порядок реєстрації (спека 2026-07-28: покращує кеш-хіти промпта);
- усі результати через одну функцію cap/sanitize, кеп 6000 символів (~1500 токенів = 6%
  від ліміту Claude Code у 25k) з нотаткою, яка каже, **чим** звузити.

---

## Поверхня інструментів

Порядок реєстрації фіксований і перевіряється тестом:

`list_agents` → `run_agent_on_pr` → `get_findings` → `get_conventions` → `get_blast_radius`

### 1 · `list_agents`
> *List the DevDigest reviewer agents configured in this workspace, with the model each one uses. Call this first: run_agent_on_pr takes an agent name from here.* (158 симв.)

Входи: немає. API: `GET /agents`.
```json
{"agents":[{"name":"General Reviewer","model":"claude-sonnet-5","enabled":true,
"description":"Broad correctness and maintainability pass"}]}
```
`description` ріжеться до 80 символів; `provider`, `id`, `version`, `system_prompt`,
`strategy`, `ci_fail_on`, `repo_intel`, `output_schema` відкидаються.

### 2 · `run_agent_on_pr`
> *Run one DevDigest reviewer agent on one pull request and return its findings. Does the whole job: starts the run, waits for it, returns {verdict, score, findings}. There is no separate start or poll call.* (204 симв.)

| поле | zod | обовʼязкове | типово |
|---|---|---|---|
| `repo` | `z.string()` | так | — |
| `pr` | `z.number().int().positive()` | так | — |
| `agent` | `z.string()` | так | — |
| `min_severity` | `z.enum(['CRITICAL','WARNING','SUGGESTION']).optional()` | ні | без фільтра |
| `limit` | `z.number().int().min(1).max(50).optional()` | ні | `20` |

API: `GET /repos` · `GET /repos/:id/pulls` · `GET /agents` (усі через кеш) →
`POST /pulls/:prId/review {agentId}` → цикл очікування на `GET /pulls/:prId/runs` →
`GET /pulls/:prId/reviews` з фільтром по `run_id`.

```json
{"verdict":"request_changes","score":38,"run_id":"9f1c2b7e-…","findings":[
{"severity":"CRITICAL","file":"server/src/modules/reviews/service.ts","line":135,
"title":"Background review crash is only logged, never surfaced",
"fix":"record the failure on the agent_runs row so the UI stops polling"}]}
```
Бюджет вичерпано (`isError: false`):
```json
{"status":"running","run_id":"9f1c…","waited_s":180,
"next":"the review is still running; call get_findings(repo=\"acme/api\", pr=42, run_id=\"9f1c…\") in about a minute"}
```

### 3 · `get_findings`
> *Return the findings of a review that already finished on this pull request. Pass run_id for a specific run; omit it for the most recent finished one. Not needed right after run_agent_on_pr, which already returns findings.* (221 симв.)

Входи: `repo`, `pr` (обовʼязкові), `run_id?`, `min_severity?`, `limit?` (20).
`repo`+`pr` обовʼязкові, бо `GET /runs/:id/findings` в API **не існує** — інструмент
композує `GET /pulls/:id/runs` з `GET /pulls/:id/reviews`, обидва PR-скоуплені. Це заразом
робить `get_findings` самодостатнім без попереднього `run_agent_on_pr` у тій самій сесії.
Відповідь — та сама форма плюс `agent`, щоб модель знала, чиї це findings.

### 4 · `get_conventions`
> *Return the coding conventions DevDigest extracted from a repository, each with its confidence and the files that evidence it. Read-only: it never starts a new extraction scan.* (175 симв.)

Входи: `repo`, `limit?` (20). API: `GET /repos/:id/conventions`.
`POST /repos/:id/conventions/scan` **свідомо не викликається** — скан витрачає LLM-токени,
а read-інструмент не має права починати платну роботу за спиною моделі. Коли
`state.status === 'never'`, payload це каже й називає ручний наступний крок.
```json
{"status":"done","scanned_at":"2026-08-11T09:12:03Z","conventions":[
{"rule":"Relative ESM imports carry the .js suffix","confidence":0.94,"status":"accepted",
"occurrence_files":230,"evidence":["server/src/app.ts:12-14"]}]}
```

### 5 · `get_blast_radius` — заглушка
> *Blast radius of a pull request: which changed symbols have callers elsewhere. Not implemented yet, always returns an empty result with degraded:true, so do not call it or retry it.* (180 симв.)

Входи: `repo`, `pr`. **API-викликів немає** — резолв `pr` б'є в `GET /repos/:id/pulls`, а це
шлях імпорту з GitHub; no-op інструмент не має права тригерити платний синк. Входи
відлунюють назад, щоб модель бачила, що вона питала.
```json
{"repo":"acme/api","pr":42,"changed_symbols":[],"downstream":[],"summary":"",
"degraded":true,"reason":"not_implemented"}
```
Форма — `BlastRadius` (`server/src/vendor/shared/contracts/brief.ts:88`), розширена
**локально** в `mcp/src/blast/contract.ts`: `BlastRadius.extend({degraded, reason})`.
`vendor/shared` не редагується → немає зміни контракту й немає дзеркала в `client/` для синку.

### Описи параметрів (`.describe()`)

Вони теж потрапляють у пошук інструментів — tool search матчить імена й описи **аргументів**,
не лише інструмента. Тому вони конкретні, а не декоративні:

| поле | `.describe()` |
|---|---|
| `repo` | `owner/name, or just the repository name` |
| `pr` | `GitHub pull request number` |
| `agent` | `reviewer agent name, exactly as list_agents returns it` |
| `run_id` | `a specific run; omit for the newest finished run on this PR` |
| `min_severity` | `return only findings at or above this severity` |
| `limit` | `max findings to return; default 20` |

`pr` як імʼя трохи неоднозначне (обʼєкт чи номер?) — рекомендація Anthropic каже
`user_id`, а не `user`. Лишаємо `pr`, як на слайді: тип `z.number().int().positive()` плюс
`.describe()` знімають двозначність там, де вона могла б виникнути.

### Аудит описів

Сума пʼяти описів — **938 символів ≈ 234 токени**, і вони резидентні **не на старті**, а
лише коли tool search розгортає сервер. Кожен ≤ 320 символів (гейт у T7).

| Опис | Який принцип несе | Механізм у тексті |
|---|---|---|
| `list_agents` | 4 — веде далі | Називає наступний інструмент **до** того, як стається помилка: «run_agent_on_pr takes an agent name from here» |
| `run_agent_on_pr` | 1 + 3 | «Does the whole job… There is no separate start or poll call» активно **спростовує** типовий для інших MCP-серверів патерн start→poll. Тут же названа форма відповіді `{verdict, score, findings}` |
| `get_findings` | 1 (захист) | «Not needed right after run_agent_on_pr» прибирає найбільший ризик принципу 1: модель викликає run, отримує findings і рефлекторно кличе get_findings ще раз. Це рекомендація Anthropic «не роби інструменти, що перекриваються», зроблена явною |
| `get_conventions` | — | «Read-only: it never starts a new extraction scan» задає очікування наперед, замість того щоб модель дізналась про це з відповіді `status:"never"` |
| `get_blast_radius` | 4 | Чесно негативний опис: дешевше сказати «не викликай», ніж витратити виклик і повернути порожнечу |

**Чого в описах свідомо немає** — щоб кожен факт жив рівно в одному місці: граматика refs,
поведінка при помилках, кеп і truncation, вимога запущеного API. Усе це один раз в
`instructions`. Офіційна порада MCP щодо `instructions` — «не переказуй описи інструментів»;
тут вона застосована в обидва боки.

---

## Рядок `instructions` (1274 символи)

```
DevDigest reviews GitHub pull requests locally with configurable AI reviewer agents.
Requires the DevDigest API running (DEVDIGEST_API_URL, default http://localhost:3001).

Refs are plain values, never ids: repo = "owner/name" or the bare repo name; pr = the
GitHub PR number; agent = the reviewer's name from list_agents.

Workflow: call list_agents once to learn the reviewer names, then
run_agent_on_pr(repo, pr, agent) - it creates the run, waits, and returns
{verdict, score, findings} itself. There is no separate start/poll step. Use
get_findings only for a run that already finished, or when run_agent_on_pr hands back a
run_id after exhausting its 180s wait budget. get_conventions returns the repo's
extracted coding conventions. get_blast_radius is a stub: it always returns
degraded:true, reason:"not_implemented".

Every tool returns compact JSON in one text block, capped near 6000 chars. When a
payload is truncated it carries a "truncated" note naming the arguments that narrow it
(min_severity, limit) - re-call with those rather than asking the user for more.

Errors name the next call: an unknown repo, pr or agent tells you which listing tool to
call. Reviews cost money and the API rate-limits review starts to 10/minute - never
retry a failed run blindly.
```

---

## Таксономія помилок

Кожне повідомлення називає наступний виклик або наступну дію. Усе живе в
`mcp/src/format/errors.ts` під снапшот-тестами.

| # | Ситуація | `isError` | Повідомлення |
|---|---|---|---|
| 1 | API недосяжний | `true` | `Cannot reach the DevDigest API at http://localhost:3001. Start it with 'cd server && pnpm dev', then call this tool again. If it runs elsewhere, set DEVDIGEST_API_URL.` |
| 2 | Таймаут запиту | `true` | `The DevDigest API did not answer GET /repos within 15s. It may still be booting or syncing GitHub — wait a few seconds and call list_agents to check it is up.` |
| 3 | Невідомий repo | `true` | `No repository matches "foo/bar". Known: acme/api, acme/web. Re-call with one of those, or add the repo in the DevDigest UI.` |
| 3b | Неоднозначне коротке імʼя | `true` | `Two repositories are named "api": acme/api, other/api. Re-call with the full owner/name form.` |
| 4 | Невідомий номер PR | `true` | `Repository acme/api has no pull request #99 imported. Imported: 41, 42, 43. Import it in the DevDigest UI, then re-call.` |
| 4b | PR знайдено, але `PrMeta.id` = null | `true` | `…has not been persisted yet. Open it once in the DevDigest UI, then re-call.` |
| 5 | Невідоме імʼя агента | `true` | `No agent named "secrity". Call list_agents for the exact names — the closest match is "Security".` |
| 6 | Прогін ще біжить | **`false`** | `{"status":"running","run_id":"9f1c…","hint":"call get_findings with the same run_id again in about 30s"}` |
| 7 | Прогін `failed`/`cancelled` | **`false`** | `{"status":"failed","error":"openrouter 401","hint":"if the error mentions a key, set it in DevDigest Settings; note that restarting the API also marks in-flight runs failed. Then call run_agent_on_pr again."}` |
| 8 | Бюджет 180с вичерпано | **`false`** | `{"status":"running","waited_s":180,"next":"call get_findings(repo=…, pr=…, run_id=…) in about a minute"}` |
| 9 | HTTP 429 на старті рев'ю | `true` | `The DevDigest API rate-limits review starts to 10 per minute… Wait about 60s — do not retry immediately.` |
| 10 | Розбіжність форми відповіді | `true` | `…unexpected shape from GET /agents (missing: name). The API and this MCP server are out of sync.` |
| 11 | Інші 4xx/5xx | `true` | `…returned 500 for POST /pulls/…/review: <200 симв. тіла>. Check the API logs.` |
| 12 | Жодного прогону на цьому PR | **`false`** | `{"status":"none","hint":"call run_agent_on_pr(repo=\"acme/api\", pr=42, agent=\"<a name from list_agents>\")"}` |
| 13 | `POST /review` прийнято, але `runs` порожній | `true` | `…started no run for agent "Security" — it is probably disabled. Call list_agents and pick one with enabled:true.` |

Рядки 6, 7, 8, 12 — `isError: false` навмисно: це **відповіді**, не збої.

---

## Цикл очікування

**SSE vs polling → обрано polling.** `GET /runs/:id/events` існує, але не підходить:

1. **У контракті немає термінальної події.** `RunEventKind` = `info|tool|result|error`
   (`contracts/trace.ts:9`); завершення сигналізується *закриттям* стріму
   (`reviews/routes.ts:66-88`) — «стрім скінчився» не відрізнити від «звʼязок обірвався».
2. **Буфер реплею — памʼять процесу** (`container.runBus`). Рестарт API посеред прогону
   знищує його **і** фліпає рядок у `failed` (`app.ts:81`). Полінг `GET /pulls/:id/runs`
   бачить цей перехід одразу; SSE-споживач бачить тишу.
3. **У Node немає `EventSource`** — довелося б руками парсити рядки з `fetch`-стріму
   або тягнути залежність.
4. **Полінг читає авторитетний запис.** `RunSummary` (`contracts/trace.ts:97`) несе
   `status`, `error`, `score`, `findings_count` — рівно те, чим інструмент відповідає.

| Параметр | Значення |
|---|---|
| Ендпоінт | `GET /pulls/:prId/runs`, матч по `run_id` (дешеве читання з БД, без GitHub, без rate limit) |
| Інтервал | `2000 ms` перші 15 полів (30с), далі `5000 ms` → ~45 запитів на весь бюджет |
| Бюджет | `180_000 ms`, константа в `src/config.ts`, не поле входу |
| Термінальні | `done` → композиція findings · `failed`/`cancelled` → рядок 7 |
| Прогрес | одна нотифікація на полінг; кожна скидає таймер клієнта — у цьому й сенс |
| Payload прогресу | `{progressToken, progress: elapsedMs, total: 180000, message: "review running (42s)"}`, лише коли `extra._meta?.progressToken` є |
| Скасування | `extra.signal` перевіряється перед кожним полінгом і передається у `fetch` |
| Fallback | рядок 8 — `run_id` + буквальний виклик `get_findings(...)` |

`waitForRun()` приймає `{pollRuns, sleep, now, onProgress, signal}` — тест ганяє його з
фейковим годинником за нуль реального часу.

---

## Файлова структура

```
mcp/
├── package.json · package-lock.json      npm; type:module; bin; start/typecheck/build/test/inspect
├── tsconfig.json · vitest.config.ts      шаблон reviewer-core + @devdigest/shared + zod self-pin
├── bin/devdigest-mcp.mjs                 node-шим: register tsx/esm → import ../src/index.ts
├── src/
│   ├── index.ts          config → createServer → StdioServerTransport
│   ├── server.ts         createServer(deps) → McpServer; реєструє 5 інструментів по порядку
│   ├── instructions.ts   INSTRUCTIONS (1274 симв.)
│   ├── config.ts         readConfig(env) → {apiUrl, requestTimeoutMs, waitBudgetMs, cacheTtlMs}
│   ├── ports.ts          interface DevDigestApi — 7 методів, які споживають інструменти
│   ├── constants.ts      MAX_PAYLOAD_CHARS, DEFAULT_LIMIT, POLL_*, TOOL_ORDER
│   ├── http/client.ts    DevDigestApi поверх fetch: таймаут, мапінг статусів, ApiError
│   ├── http/schemas.ts   lenient .passthrough() парсери — лише поля, які реально читаються
│   ├── resolve/cache.ts  TTL Map, тільки позитивні записи
│   ├── resolve/refs.ts   resolveRepo / resolvePr / resolveAgent
│   ├── review/wait.ts    waitForRun(): полінг + прогрес + бюджет + скасування
│   ├── format/compact.ts toFindingsPayload / toAgentsPayload / toConventionsPayload / capPayload
│   ├── format/errors.ts  таксономія — одна функція на рядок
│   ├── blast/contract.ts BlastRadiusResult = BlastRadius.extend({degraded, reason})
│   └── tools/            registry.ts + 5 модулів інструментів
├── test/                 fake-api · format · errors · resolve · http-client · wait
│                         · token-budget · mcp-integration
├── CLAUDE.md · README.md (mermaid) · INSIGHTS.md
├── docs/tool-surface.md · specs/2026-08-14-devdigest-mcp.md
.mcp.json                 (корінь — реєстрація для Claude Code)
```

**Інструменти не ходять у HTTP і не форматують.** Модуль інструмента резолвить refs через
`resolve/`, викликає методи `DevDigestApi`, віддає результат у `format/` — і все. Саме це
дозволяє інтеграційному тесту підміняти *порт*, а не HTTP.

---

## Конфіги

`mcp/package.json` — npm, `"type": "module"`, `bin: {"devdigest-mcp": "bin/devdigest-mcp.mjs"}`,
скрипти `start` / `typecheck` / **`build` = той самий `tsc --noEmit`** (як `reviewer-core` —
пакет ніколи не емітить JS) / `test` / `inspect`.
Deps: `@modelcontextprotocol/sdk ^1.30.0`, `zod ^3.24.1`. Dev: `@types/node`, `tsx`,
`typescript`, `vitest`.

`mcp/tsconfig.json` — байт-у-байт `reviewer-core/tsconfig.json`, крім `include`
(`["src/**/*.ts","test/**/*.ts"]`). **zod self-pin навантажений двічі:** раз через
загальнорепозиторну проблему дубльованих інстансів zod, і раз тому, що
`McpServer.registerTool` валідує кожен вхід через `instanceof z.ZodError`.

`mcp/vitest.config.ts` — дзеркалить **обидва** аліаси в `resolve.alias`.

`mcp/bin/devdigest-mcp.mjs`:
```js
#!/usr/bin/env node
import { register } from 'node:module';
register('tsx/esm', import.meta.url);
await import('../src/index.ts');
```

Кореневий `.mcp.json`:
```json
{ "mcpServers": { "devdigest": {
  "command": "node",
  "args": ["mcp/bin/devdigest-mcp.mjs"],
  "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}" }
}}}
```

---

## Тестування

Усе герметичне: без Docker, без API, без мережі, без LLM.

**Юніти.** `format` — проєкція на 5 полів, кеп на 200 findings, нотатка truncated;
`errors` — усі 13 рядків через `toMatchInlineSnapshot`, щоб формулювання ревʼюилось як diff;
`resolve` — порядок матчу uuid → `full_name` → коротке імʼя, неоднозначність, null `id`,
**підрахунок кеш-хітів** (три резолви = один виклик порту); `wait` — фейковий годинник:
`done`, `failed`, бюджет рівно на 180с, `signal.abort()`, каденція прогресу;
`http-client` — застабаний `globalThis.fetch`: адитивне поле парситься, перейменоване дає
`kind:'shape'`, 429 → рядок 9, 500 → рядок 11, таймаут → рядок 2.

**Інтеграція через in-memory MCP-клієнт.** `InMemoryTransport.createLinkedPair()` звʼязує
справжній `Client` зі справжнім `McpServer` із `createServer({api: fakeApi})`. Шість
кейсів: 5 інструментів у фіксованому порядку без `outputSchema`; щасливий шлях
`run_agent_on_pr`; прогін, що ніколи не завершується → fallback рядка 8; невідомий агент →
`isError:true` зі згадкою `list_agents`; прогрес-нотифікації доходять до `onprogress`;
200 findings → payload ≤ 6000 символів із нотаткою.

**Снапшот бюджету токенів** — гейт, який тримає дизайн чесним: імена **й порядок**;
`INSTRUCTIONS.length < 2048` + інлайн-снапшот точного числа; кожен опис ≤ 320;
жоден інструмент не має `outputSchema`; `JSON.stringify(tools).length < 3500`;
резидентна оцінка < 400 токенів; **і перевірка stdout** — жоден файл під `src/**` не
містить `console.log(` чи `process.stdout.write(`.

**MCP Inspector CLI** — вручну, не в `npm test`.

---

## Задачі

| # | Задача | Файли | Verify | Skill |
|---|---|---|---|---|
| **T0** | Зберегти цей план у репо як Development Plan (конвенція `docs/plans/`) | `docs/plans/2026-08-14-devdigest-mcp.md` | файл існує | — |
| **T1** | Скафолд пакета: package.json, tsconfig (self-pin + аліас), vitest.config, bin-шим, `config.ts`, `constants.ts`, `instructions.ts`, `.gitignore` | `mcp/*` | `cd mcp && npm install && npm run typecheck` | `typescript-expert` |
| **T2** | Порт `DevDigestApi` (7 методів) + реалізація поверх `fetch` + lenient-схеми + типізовані `ApiError` | `mcp/src/{ports,http/client,http/schemas}.ts`, `mcp/test/http-client.test.ts` | `npm run typecheck && npm test` | `onion-architecture`, `zod`, `typescript-expert` |
| **T3** | Резолв refs + TTL-кеш (три резолви = один виклик порту) | `mcp/src/resolve/*`, `mcp/test/resolve.test.ts` | `npm run typecheck && npm test` | `onion-architecture`, `typescript-expert` |
| **T3b** | Чисті правила відбору: порядок матчу репо, вибір «того самого» прогону, впорядкування severity, найближче імʼя агента | `mcp/src/domain/select.ts`, `mcp/test/select.test.ts` | `npm test` | `onion-architecture` |
| **T4** | Єдина лійка cap/sanitize + таксономія помилок + локальний blast-контракт | `mcp/src/format/*`, `mcp/src/blast/contract.ts`, `mcp/test/{format,errors}.test.ts` | `npm run typecheck && npm test` | `zod`, `security`, `typescript-expert` |
| **T5** | Цикл очікування з інʼєкцією годинника, прогресом, бюджетом і скасуванням | `mcp/src/review/wait.ts`, `mcp/test/wait.test.ts` | `npm run typecheck && npm test` | `onion-architecture`, `typescript-expert` |
| **T6** | 5 інструментів + впорядкований реєстр + `server.ts` + `index.ts` | `mcp/src/tools/*`, `mcp/src/{server,index}.ts` | `npm run typecheck && npm test` | `onion-architecture`, `zod`, `security` |
| **T7** | Гейт бюджету токенів + перевірка чистоти stdout | `mcp/test/token-budget.test.ts` | `npm test` | `typescript-expert` |
| **T8** | Інтеграція через in-memory MCP-клієнт над фейковим портом | `mcp/test/{helpers/fake-api,mcp-integration}.ts` | `npm run typecheck && npm test` | `typescript-expert`, `zod` |
| **T9** | Реєстрація в Claude Code + два однорядкові фікси гейтів, які інакше мовчки не покриють `mcp/` | `.mcp.json`, `.claude/skills/pr-self-review/assets/preflight.sh:133`, `.claude/skills/deprecation-policy/assets/deprecation-audit.sh:16` | `node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))" && bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh` | — |
| **T10** | Доки модуля: CLAUDE.md, README з mermaid, INSIGHTS.md, docs/tool-surface.md, spec | `mcp/{CLAUDE,README,INSIGHTS}.md`, `mcp/docs/`, `mcp/specs/` | лінки резолвляться, діаграма рендериться | `mermaid-diagram` |
| **T11** | Wrap-up: додати вивчене | `mcp/INSIGHTS.md` | `npm test` | `engineering-insights` |

Жорсткий ланцюг: T1 → T2 → T3 → T4 → T5 → T6. T7 і T8 залежать від T6; T9 від T6;
T10 від T8+T9.

`CLAUDE.md` модуля (T10) має зафіксувати гочі: stdout — це канал JSON-RPC;
`GET /repos/:id/pulls` є шляхом імпорту з GitHub, тому кеш резолвера — не оптимізація;
`app.ts:81` фліпає `running` → `failed` на рестарті API; `POST /pulls/:id/review` — 10/хв;
`GET /runs/:id/findings` не існує; zod self-pin не можна прибирати; `vendor/shared` звідси
не редагується.

---

## Вплив на контракти й версії

**Зміни контрактів немає. Нічого не ламається. Вердикт: MINOR.**
`vendor/shared` не торкаємось (blast-форма розширена локально), роутів не додаємо,
експорти `reviewer-core` не чіпаємо, БД не торкаємось. Нова поверхня — новий пакет,
5 імен інструментів, `instructions` і кореневий `.mcp.json`. Суто адитивно.

**Але два гейти мовчки перестають покривати дерево**, тому вони втягнуті в T9, а не в
follow-up — мовчазна прогалина в мерж-гейті гірша за відкладену документацію:
- `.claude/skills/pr-self-review/assets/preflight.sh:133` — `for pkg in server client reviewer-core`
  не тайпчекає `mcp/`;
- `.claude/skills/deprecation-policy/assets/deprecation-audit.sh:16` — `SCAN_DIRS=(server/src
  client/src reviewer-core/src)` не сканує `mcp/src` на `@deprecated`.

Решта згадок пакетів у текстах скілів (`deprecation-policy/SKILL.md:77,301`,
`references/lifecycle.md:63`, `breaking-change`) — документація, не виконуваний код;
вони в follow-up.

---

## Поза обсягом

- Справжній blast radius (друга половина L04, читає `repo-intel`).
- Старт conventions-скану з інструмента (read-інструмент не витрачає LLM-токени сам).
- Споживання SSE.
- Будь-які write-інструменти (`create_agent`, `accept_finding`, `import_pr`). Пʼять — фінально.
- Remote/HTTP-транспорт, auth, мультиворкспейс.
- Зміни під `server/`, `client/`, `reviewer-core/`, `e2e/`.

## Follow-up (наступна ітерація)

`.github/workflows/mcp.yml` · рядок у кореневому `CLAUDE.md` · пакет-таблиця, mermaid і
рядок L04 у `README.md` · рядок у `TESTING.md` · `scripts/dev.sh` · рядок `mcp/` у
`.claude/skills/engineering-insights/SKILL.md` · текстові згадки пакетів у
`deprecation-policy` і `breaking-change` · роутінг `mcp/` у `pr-self-review` ·
`scripts/verify-l04.sh`.

**Друга половина L04 (справжній Blast Radius) — окрема робота в `server/`:** новий слайс
`server/src/modules/blast/` з роутом `GET /pulls/:id/blast-radius`, який кличе
`container.repoIntel.getBlastRadius(repoId, changedFiles)` (`repo-intel/types.ts:147`),
плюс запис у `modules/index.ts` — `blast` там уже перелічений як запланований
(`modules/index.ts:25`). Контракт `BlastRadius` уже існує, тож зміни контракту й синку
дзеркала в `client/` не буде. Після цього `mcp/src/tools/get-blast-radius.ts` міняє
заглушку на виклик — решта модуля не рухається.

---

## Кінцева перевірка

```sh
# 1 — модуль збирається, герметична сюїта проходить
cd mcp && npm install && npm run typecheck && npm test

# 2 — решта репо не зрушила (дешевий доказ, що новий paths нічого не зачепив)
cd server && pnpm typecheck
cd reviewer-core && npm run typecheck
cd e2e && npm run typecheck

# 3 — файл реєстрації валідний і це єдина коренева зміна
node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))" && git status --short

# 4 — протокольний smoke без запущеного API (tools/list не потребує API)
cd mcp && npx -y @modelcontextprotocol/inspector --cli node bin/devdigest-mcp.mjs --method tools/list

# 5 — живий smoke з піднятим API (в іншому терміналі: docker compose up -d && cd server && pnpm dev)
cd mcp && npx -y @modelcontextprotocol/inspector --cli node bin/devdigest-mcp.mjs \
  --method tools/call --tool-name list_agents

# 6 — у Claude Code: рестарт → /mcp показує devdigest із 5 інструментами →
#     «переглянь PR <n> в <owner/repo> агентом <agent>» повертає {verdict, score, findings}
#     за ОДИН виклик інструмента → /context показує ~330 токенів, не тисячі
```

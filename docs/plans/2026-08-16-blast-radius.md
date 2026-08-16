# Blast Radius — L04, друга половина

## Context

Курсовий roadmap (`README.md:85`) визначає L04 як «`devdigest-mcp` server ·
Blast Radius (reads `repo-intel`)». Перша половина вже здана на гілці `lab-4-hw`
(коміт `8f0d4fb`): MCP-сервер із пʼятьма інструментами, де `get_blast_radius` —
**свідома заглушка**, що завжди повертає `degraded:true, reason:"not_implemented"`.

Фіча — карта потенційного впливу змін, що відповідає ревʼюверу на питання
**«що ще може зачепити цей diff?»**: які символи оголошені у змінених файлах,
хто їх викликає (файл + рядок), які HTTP-ендпоінти та cron-джоби залежать від
цього коду, і які попередні PR уже торкались тих самих файлів.

**Головне, що визначає обсяг:** рушій уже написаний і працює —
`RepoIntelService.getBlastRadius` (`server/src/modules/repo-intel/service.ts:220`),
з двома шляхами: персистентний індекс у Postgres (`tryPersistentBlast`) і
ripgrep-фолбек. Він просто **не має HTTP-роуту**. Готові також: Zod-контракти
`BlastRadius`/`PrHistory` (`vendor/shared/contracts/brief.ts:65-109`), i18n-неймспейс
`client/messages/en/blast.json` (сирота — його ніхто не читає), картка-плейсхолдер
`BlastRadiusCard`, і навіть seed — це рівно той PR із макета
(`acme/payments-api` #482, `server/src/db/seed.ts:94-195`).

Робота — **не «побудувати аналіз», а зʼєднати наявне**: роут → хук → картка →
MCP-інструмент, плюс seed репо-інтел таблиць, без якого картка на демо-даних
лишиться порожньою.

**Рішення користувача:** обидва види (Tree + Graph); секція «Prior PRs touching
these files» входить; MCP-заглушку розкриваємо.

---

## 1 · Контракт

`BlastRadius`, `ChangedSymbol`, `BlastCaller`, `DownstreamImpact`, `PrHistoryItem`
**не змінюємо жодним чином**. Додаємо один новий експорт у
`server/src/vendor/shared/contracts/review-api.ts` — це файл, який за власним
описом володіє «persisted/transport shapes the reviewer endpoints return», поряд
із `SmartDiffResponse` і `PrIntentRecord`. Він уже імпортує з `./brief.js`,
тож туди лише додається `BlastRadius, PrHistoryItem`.

```ts
export const BlastRadiusResponse = BlastRadius.extend({
  /** Union across every symbol. Always populated — including the degraded path. */
  endpoints_affected: z.array(z.string()).default([]),
  crons_affected: z.array(z.string()).default([]),
  history: z.array(PrHistoryItem).default([]),
  /** True when the engine hit its global caller cap; counts render as "N+". */
  truncated: z.boolean().default(false),
  degraded: z.boolean(),
  reason: z.string(),          // '' == not degraded
});
```

**Чому плаский конверт, а не `{blast, history}`:** `mcp/src/blast/contract.ts`
парсить тіло як `BlastRadius.extend({degraded, reason})` — плаский шейп дає
змогу лишити цей файл **недоторканим**, а zod сам зріже `history` та roll-up'и,
за які MCP не хоче платити токенами.

**Чому `reason` обовʼязковий рядок, а не `.nullish()`:** локальний
`BlastRadiusResult` в MCP уже оголошує `reason: z.string()`. Nullish зламав би
його `.parse()`.

**Чому roll-up'и верхнього рівня дублюють per-symbol поля:** на деградованому
шляху `factsByFile` відсутній, тож ендпоінти **неможливо** привʼязати до символу,
хоча `impactedEndpoints` заповнений. Без top-level поля картка показала б
`0 endpoints`, поки рушій знає про пʼять. Отже: per-symbol масиви — це
*атрибутована* правда (порожні при деградації), top-level — *union*-правда
(завжди коректна).

### `merged_at`

`PrHistoryItem.merged_at` — обовʼязковий `z.string()`, а колонки `merged_at` у
`pull_requests` немає: GitHub-адаптер читає `pr.merged_at` лише щоб вивести
`status` (`adapters/github/octokit.ts:60`).

**Рішення: не чіпати контракт**, а мапити `merged_at ← updated_at ?? opened_at`
і нести справжній стан у `notes` (`"merged"` / `"open"` / …), щоб UI **ніколи не
стверджував мердж, якого не було** — він рендерить бейдж зі `notes`, а дату
показує як відносний час у згорнутій вторинній секції. Апроксимацію задокументувати
в JSDoc `repository.ts`. Альтернативи відкинуто: послаблення поля до `.nullish()`
формально ламає гарантію для читача, а нова колонка + бекфіл із GitHub — це зміна
шляху імпорту, непропорційна вторинній секції картки.

### Semver і дзеркало

**MINOR** — нічого не звужено, все адитивне (новий експорт + новий роут).
Міграція індексів — **PATCH**, expand/contract не потрібен, маркери
`@deprecated` не потрібні.

**Дзеркало обовʼязкове:** `client/src/vendor/shared/contracts/review-api.ts` має
лишитись байт-у-байт ідентичним. Барелі — `export *` (`index.ts:18`), тож окремий
реекспорт не потрібен; оновити лише коментар-опис у шапці обох.
**Увага:** `server/test/contracts.test.ts` дзеркало **не перевіряє** (перевірено —
там немає ні `readFileSync`, ні порівняння файлів), тож `diff -q` має бути явним
кроком у `verify-l04.sh`.

**Третього дзеркала немає:** `mcp/tsconfig.json` мапить `@devdigest/shared` прямо
на серверний файл, тож MCP підхоплює зміну без копії — і дрейф контракту стає
там **помилкою typecheck**.

---

## 2 · Server: слайс `server/src/modules/blast/`

Форму копіюємо з `server/src/modules/smart-diff/` — найновіший слайс, зроблений
за ports-first правилом (`server/INSIGHTS.md:21`, `:53`). `index.ts` не потрібен —
`modules/index.ts` імпортує `./blast/routes.js` напряму.

| Файл | Відповідальність |
|---|---|
| `ports.ts` | `BlastStore`, `BlastEngine` + структурні шейпи, `Logger`. **Не імпортує нічого** |
| `constants.ts` | капи, `ENGINE_CALLER_CAP` |
| `assemble.ts` | чиста функція: `BlastEngineResult` + к-сть файлів → `BlastModel`. Уся логіка групування/dedup/капів/порядку/`summary`. Без I/O |
| `helpers.ts` | `BlastModel` + history-рядки → snake_case DTO |
| `repository.ts` | `implements BlastStore` — **єдиний** файл слайсу з Drizzle / `db/schema` |
| `service.ts` | оркестрація + `safeParse` + логи. Конструктор бере **deps, не `Container`** |
| `routes.ts` | composition root: репозиторій, адаптація `container.repoIntel`, роут |

### Крос-слайсова заборона — найгостріший край

`no-cross-slice-imports` має `severity: 'error'`
(`.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs:132`), а
`tsPreCompilationDeps: true` (`:207`) без винятку для типів означає, що
**`import type` теж рахується**. Тобто `blast` не може навіть типово імпортувати
`repo-intel/types.ts`.

`blast/ports.ts` оголошує власний **структурний** порт і ніде не називає repo-intel:

```ts
export interface BlastEngineCaller {
  file: string; symbol: string; viaSymbol: string; line: number; rank: number;
}
export interface BlastEngineResult {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: BlastEngineCaller[];
  impactedEndpoints: string[];
  /** Keyed by CALLER file. Absent on the degraded/ripgrep path. */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;   // widened from repo-intel's DegradedReason union on purpose
}
export interface BlastEngine {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastEngineResult>;
}
```

У `routes.ts` — просте присвоєння `const engine: BlastEngine = container.repoIntel;`.
Типізується: `reason?: DegradedReason` — union строкових літералів, присвоюваний
у `string`, а позиція повернення методу коваріантна. `routes.ts` — санкціонований
composition root, тож доступ до `Container` тут дозволений.

**Важлива поправка:** `server/.dependency-cruiser.cjs` **не існує** і жоден скрипт
depcruise не запускає — правила онійону тут на чесному слові. Перевірити руками
одноразово (команда в §7), інакше порушення просто ніхто не спіймає.

### Маппінг (`assemble.ts`)

1. **Символи.** Dedup `changedSymbols` за `` `${name}|${file}` ``, кап `MAX_CHANGED_SYMBOLS = 50`.
2. **Каллери** групуються за `viaSymbol`; dedup за `` `${file}|${symbol}|${line}` ``;
   всередині групи сорт `rank desc → file asc → line asc`; кап
   `MAX_CALLERS_PER_SYMBOL = 20`. Каллери з `viaSymbol`, якому не відповідає
   жоден символ, відкидаються з `log.warn` + семпл.
3. **Атрибуція.** `factsByFile` є → per-symbol union по файлах саме цього символу,
   dedup + сорт, кап 12/12. `factsByFile` немає → per-symbol `[]`/`[]`.
   Приписати плаский union кожному символу було б брехнею перед ревʼювером.
4. **Roll-up'и.** `endpoints_affected`: персистентний шлях — union per-symbol;
   деградований — `impactedEndpoints` як є. `crons_affected`: персистентний —
   union; деградований — `[]` (ripgrep-шлях крони не витягує взагалі).
   Обидва dedup + сорт, кап `MAX_ROLLUP = 40`.
5. **`downstream`** — запис на **кожен** змінений символ, **включно з тими, що
   мають нуль каллерів** (`callers: []`). Символ, що зник між лічильником
   `N symbols` і списком, читається як баг. Сорт: `callers.length desc` →
   `max(rank) desc` → `symbol asc`; кап `MAX_DOWNSTREAM = 25` — так символи з
   каллерами завжди переживають зріз.
6. **`truncated`** = `engine.callers.length >= ENGINE_CALLER_CAP`.
7. **`summary`** — детерміноване англійське речення, будується тут і покривається
   юніт-тестом: `12 changed symbols, 27 callers across 9 files, 3 endpoints, 1 cron job.`
   / `…, no downstream callers found.` / при `truncated` — `20+ callers` /
   при деградації префікс `Best-effort (repository not fully indexed): …`.

**Клієнт `summary` не рендерить** — воно англомовне за контрактом, і його показ
обійшов би next-intl. Воно існує для MCP/LLM і для `<desc>` графа. Картка будує
весь текст із i18n-ключів і лічильників.

Будь-яке обрізання по капу — `log.warn` (зразок: `smart-diff/service.ts` з
`orphanFiles`/`duplicatePaths`), ніколи не мовчки.

### Prior PRs (`repository.ts`)

```sql
SELECT pr.number, pr.title, pr.author, pr.status, pr.updated_at, pr.opened_at,
       count(DISTINCT f.path)::int AS overlap_count,
       array_agg(DISTINCT f.path)  AS overlap_paths
FROM pr_files f JOIN pull_requests pr ON pr.id = f.pr_id
WHERE pr.workspace_id = $1 AND pr.repo_id = $2 AND pr.id <> $3
  AND f.path = ANY($4::text[])
GROUP BY pr.id
ORDER BY overlap_count DESC, pr.updated_at DESC NULLS LAST
LIMIT $5
```

- **Скоуп по workspace І по repo.** `src/index.ts` існує в кожному репо — це
  вимога коректності, не оптимізація.
- **Без фільтра по статусу.** Відкритий PR, що чіпає ті самі файли, — саме та
  колізія, яку варто показати. Статус їде в `notes`.
- Капи: `MAX_HISTORY_PROBE_PATHS = 200` (зрізати шляхи до біндингу),
  `MAX_HISTORY_PRS = 5`, `MAX_OVERLAP_PATHS_PER_PR = 5` (зрізати в JS, не в SQL —
  субскрипт `[1:5]` на агрегаті погано лягає в шаблон Drizzle).
- Drizzle: `sql<number>` для `count(distinct …)`, `sql<string[]>` для `array_agg`.

### Міграція (адитивна, PATCH)

`pr_files` не має **жодного** індексу, крім PK на `id` (`0000_init.sql`), а
таблиця несе ще й повний `patch`. Додати в `src/db/schema/pulls.ts`:
`index('pr_files_path_idx').on(t.path)` — для цього запиту — і
`index('pr_files_pr_id_idx').on(t.prId)`, бо `smart-diff`, `intent` і diff-viewer
фільтрують по `prId` без індексу вже зараз. Прецедент —
`findings_review_id_severity_idx` (`server/INSIGHTS.md:60`).
Тільки ADD → `pnpm db:generate` **не** піде в інтерактив (`server/INSIGHTS.md:15`),
один прогін дає `0017_*.sql`.

### Роут і статуси

`GET /pulls/:id/blast-radius`, `schema: { params: IdParams }`, `getContext` для
тенансі, **без `response:`** — `fastify-type-provider-zod` зрізав би вкладені
`downstream[].callers[]` (`server/INSIGHTS.md:43`).

| Ситуація | Відповідь |
|---|---|
| PR не існує в цьому workspace | **404** `NotFoundError` |
| `:id` не uuid | **422** через `IdParams` |
| усе інше, включно з непроіндексованим репо | **200** + можливо порожнє тіло з `degraded:true` |
| `changedPaths.length === 0` | **200**, `degraded:true, reason:'no_files'`, рушій **не** викликається |

**Свідома розбіжність із `intent`:** там 404 = «LLM-артефакт ще не пораховано»,
тому клієнт трактує його як порожній стан. Blast детермінований і завжди
обчислюваний, тож 404 = «не той id». Хук **не** повинен мати `isNotComputed`.

DTO валідує сам себе: `BlastRadiusResponse.safeParse(dto)` → при невдачі лог
issues + `AppError('internal_error', …, 500)`, **ніколи не голий `.parse()`**
(обробник мапить `ZodError` у 422 і звинуватив би клієнта).

Реєстрація: один імпорт + один запис `blast` у `src/modules/index.ts` (він там
уже названий як запланований, `:25`).

### Кешування

**Немає.** Обчислення детерміноване, без LLM і без грошей; `file_facts`/`file_rank`
вже і є кеш. У `pr_brief` **не писати** — це неверсіонований jsonb-блоб, що
належить пізнішому уроку composed-brief; частковий документ там створив би
незадекларований контракт на спільному рядку. Клієнт отримує `staleTime` замість
серверного кешу.

---

## 3 · Seed — без нього фічі не видно

Seed-репо має `clonePath: null` (`seed.ts:108`), а таблиці `symbols` / `references`
/ `file_facts` / `file_rank` / `repo_index_state` не сідяться взагалі. Отже
**обидва** шляхи `getBlastRadius` повернуть порожньо + `degraded` — картка на
демо-даних буде порожня, і перевірити фічу буде нічим.

Сідимо для `acme/payments-api` (під наявним idempotent-гардом `if (!pr)`):
`repo_index_state` (`status:'full'`), `symbols` — `rateLimit`, `bucketKey` у
`src/middleware/ratelimit.ts`; `references` із `decl_file` на цей файл і викликами
в `src/api/public/index.ts:23`, `webhooks.ts:45`, `health.ts:11`, `server.ts:88`;
`file_rank` для цих файлів; `file_facts` з ендпоінтами `GET /api/public/items`,
`POST /api/public/webhooks`, `GET /api/public/health` і кроном
`reset-rate-buckets`. Плюс другий PR, що торкається `src/middleware/ratelimit.ts`,
щоб секція Prior PRs не була порожня.

Це рівно вміст макета — тобто seed і є доказом, що фіча працює.

---

## 4 · Client: справжня картка

### Хук — `client/src/lib/hooks/blast.ts`

За зразком `hooks/intent.ts`: `prBlastKey(prId)`, `usePrBlastRadius(prId)` →
`api.get<BlastRadiusResponse>(\`/pulls/${prId}/blast-radius\`)`,
`enabled: prId != null`, `retry: false`, `staleTime: 60_000`.
Тип — **`import type`**: перший *value*-імпорт із `@devdigest/shared` ламає
`pnpm build` при зелених typecheck+test (`client/INSIGHTS.md:18`).

### Дерево компонентів

```
BlastRadiusCard/
  BlastRadiusCard.tsx  BlastRadiusCard.test.tsx  helpers.test.ts
  constants.ts  helpers.ts  styles.ts  index.ts
  _components/
    BlastStatsRow/     «2 symbols · 14 callers · 3 endpoints · 1 cron» + слот toggle
    BlastViewToggle/   локальна копія форми DiffOrderToggle
    BlastSymbolList/   downstream[] → рядки
    BlastSymbolRow/    розкривний символ + каллери
    BlastImpactBadges/ бейджі ендпоінтів і кронів
    BlastGraph/        inline SVG
    PriorPrsSection/   розкривна історія
```

`BlastRadiusCard` бере `{ prId: string | null }`; `OverviewTab.tsx` оновити на
`<BlastRadiusCard prId={prId} />`.

`BlastViewToggle` — **локальна копія**
`DiffTab/_components/DiffOrderToggle` (`role="tablist"` + `role="tab"` +
`aria-selected` + `tabFor(active)`), не імпорт: імпорти між фічами заборонені,
промоція — лише на другого незалежного споживача. Її `styles.ts` уже ставить
`borderWidth: 0, borderStyle: "none"` замість `border` — скопіювати саме цю форму,
бо мішати shorthand із longhand у стан-залежній функції не можна
(`client/INSIGHTS.md:82`).

**Collapsible-примітиву немає** — розкриття руками: `useState` + `role="button"`
+ `tabIndex={0}` + `aria-expanded` + `onKeyDown` (Enter / Space) + чевронка з
`transform: rotate(...)`, як у `ReviewRunAccordion` / `diff-viewer/FileCard`.

Іконки (усі підтверджено в закритому наборі `vendor/ui/icons.tsx`): `Workflow`,
`Code`, `CornerDownRight`, `Globe`, `Clock`, `History`, `ChevronRight`,
`ChevronDown`.

### Tree

Заголовок символу: `Icon.Code` + mono `name` (дужки `()` дописуємо **лише** коли
`kind` — `function`/`method`) + приглушений basename файлу; праворуч
`t("callerCount", {count})`. Розкрито: рядки каллерів `Icon.CornerDownRight` +
mono `` `${file}:${line}` `` + приглушене імʼя охопного символу, далі
`BlastImpactBadges` для цього символу.

Каллер-рядок робимо клікабельним через `MonoLink href={githubBlobUrl(...)}`
(`client/src/lib/github-urls.ts`) — нового коду не треба. Для цього `OverviewTab`
прокидає `repoFullName` і `headSha` (обидва вже є на сторінці: `activeRepo`,
`pr.head_sha`); якщо їх немає — звичайний mono-текст.

**`enclosingFromRows` падає назад на basename файлу**, тож `caller.symbol` буває
`"routes.ts"` — ніколи не дописувати до нього `()` і не подавати як функцію.

Символи з нулем каллерів рендеряться тим самим рядком, але неінтерактивним (без
`tabIndex`, без чевронки) і з `t("callerCount", {count: 0})` → `no callers`.

### Graph — inline SVG

Дводольний, дві колонки; компоновка — чиста `helpers.ts::layoutGraph(...)` →
`{nodes, edges, width, height}`, покрита юніт-тестом.

- `viewBox="0 0 320 {height}"`, `style={{width:"100%", height:"auto"}}`,
  `preserveAspectRatio="xMidYMid meet"` — масштабується в комірку
  `minmax(320px, 1fr)` без resize observer.
- `NODE_W=128`, `NODE_H=22`, `ROW=30`, `PAD_Y=12`; ліва колонка `x=8`, права
  `x=320-8-NODE_W`; `height = PAD_Y*2 + max(рядків)*ROW`.
- Ліворуч — змінені символи (кап 8), праворуч — **унікальні файли-каллери**
  (кап 12). Згортання каллерів у файли — саме те, що робить diff на 20 каллерів
  читабельним.
- Переповнення колонки → один додатковий приглушений вузол `t("graph.more", {count})`
  без ребер; плюс `20+` у стат-рядку при `truncated`. Мовчазного обрізання немає.
- Вузли — `<rect rx={4}>`: символи `fill=var(--accent-bg) stroke=var(--accent)`,
  файли `fill=var(--bg-hover) stroke=var(--border)`. Ребра — кубічна безʼє
  `M x1 y1 C x1+40 y1, x2-40 y2, x2 y2`, `stroke=var(--border)`; при hover на
  символі його ребра стають `var(--accent)`.
- **У SVG немає `text-overflow`** — обрізати підпис у JS (`ellipsize(label, 20)`),
  повний текст у `<title>`.
- **Доступність:** `<svg role="img" aria-label={t("graph.ariaLabel", {...})}>` +
  дочірній `<title>` + `<desc>` із `summary`. Вузли **не** робимо фокусованими —
  фокусований елемент без активації це клавіатурна пастка. Під графом —
  приглушений `t("graph.hint")`, що вказує на Tree, який несе ті самі дані й
  повністю навігується клавіатурою. Це чесна відповідь: граф — альтернативна
  *подача*, дерево — доступне джерело.
- Порожньо → `EmptyState` з `graph.empty`.

Жодних нових залежностей; recharts не чіпаємо (він і так джерело пастки з
`.next/vendor-chunks`).

### Бейджі (`constants.ts`)

Токена HTTP-методу в `SEV`/`CAT` немає. Локальна мапа — усі токени підтверджено
в `styles.css` для обох тем:

```ts
export const METHOD_TOKEN: Record<string, { c: string; bg: string }> = {
  GET:     { c: "var(--accent)", bg: "var(--accent-bg)" },
  HEAD:    { c: "var(--accent)", bg: "var(--accent-bg)" },
  OPTIONS: { c: "var(--accent)", bg: "var(--accent-bg)" },
  POST:    { c: "var(--accent)", bg: "var(--accent-bg)" },
  PUT:     { c: "var(--warn)",   bg: "var(--warn-bg)" },
  PATCH:   { c: "var(--warn)",   bg: "var(--warn-bg)" },
  DELETE:  { c: "var(--crit)",   bg: "var(--crit-bg)" },
};
export const METHOD_FALLBACK = { c: "var(--info)", bg: "var(--info-bg)" };
export const CRON_TOKEN     = { c: "var(--warn)",  bg: "var(--warn-bg)" };
```

GET і POST — акцентні, як на макеті; мутуючі методи додають сигнал там, де макет
мовчить. `helpers.ts::parseEndpoint("GET /api/public/items")` →
`{method:"GET", path:"/api/public/items"}`; нерозбірливе → `{method:null, path:raw}`
із `METHOD_FALLBACK`. Ендпоінти — `icon="Globe"`, крони — `icon="Clock"`, обидва
`mono`. `extractCrons` віддає або cron-вираз, або `job:<kind>` — префікс `job:`
зрізаємо.

### Prior PRs

Розкривна секція, **згорнута за замовчуванням**: заголовок `role="button"`
+ `tabIndex={0}` + `aria-expanded` + Enter/Space, `Icon.History`,
`t("history.title")`, `Badge` з лічильником, чевронка `Icon.ChevronDown`.
Рядок: mono `#{pr_number}`, обрізаний заголовок, автор, `relativeTime(merged_at)`
з `@/lib/time`, `Badge` статусу з `notes` (через known-set + fallback), і
`t("history.overlap", {count: files_overlap.length})` з
`title={files_overlap.join("\n")}`.

### Стани

| Умова | Рендер |
|---|---|
| `isLoading` | три `Skeleton` (як в `IntentCard`) |
| помилка (у т.ч. 404) | `ErrorState` + retry |
| `changed_symbols.length === 0` | `EmptyState` icon=`Workflow` |
| символи є, каллерів нема | стат-рядок + `t("noDownstream", {count})` |
| `degraded` | дані рендеряться нормально + бейдж `partial` у слоті `right` в `SectionLabel`, `title` = змапена причина |

Toggle Tree/Graph живе у правому слоті `BlastStatsRow` (як на макеті), тож із
бейджем `partial` вони не конкурують.

`reason` і `notes` приходять із сервера як **відкриті рядки**, а next-intl падає
на відсутньому ключі — обидва лукапи обовʼязково через known-set + `unknown`:

```ts
export const DEGRADED_REASONS = new Set([
  "no_data", "no_files", "flag_off", "index_failed", "index_partial", "repo_too_large",
]);
```

### i18n

Переписуємо `client/messages/en/blast.json` (неймспейс-сирота: `useTranslations("blast")`
не викликає ніхто, тож перепрофілювання `stat.*` із голих іменників на
ICU-плюрали нікому не коштує). Автозавантаження вже є через `readdirSync` у
`src/i18n/request.ts` — реєструвати нічого не треба. Локаль одна: `en`.

Плюрали пишемо **одразу**, а не після того, як ревʼювер побачить «1 crons»
(`client/INSIGHTS.md:37`):

```json
"stat": {
  "symbols":   "{count, plural, one {# symbol} other {# symbols}}",
  "callers":   "{count, plural, one {# caller} other {# callers}}",
  "endpoints": "{count, plural, one {# endpoint} other {# endpoints}}",
  "crons":     "{count, plural, one {# cron job} other {# cron jobs}}"
},
"statTruncated": { "callers": "{count}+ callers" },
"callerCount": "{count, plural, =0 {no callers} one {# caller} other {# callers}}",
"noDownstream": "{count, plural, one {# changed symbol} other {# changed symbols}}, no downstream callers found."
```

Плюс `title`, `view.{tree,graph,ariaLabel}`, `symbols.{ariaLabel,toggle}`,
`impact.{endpoints,crons,none}`, `graph.{empty,ariaLabel,more,hint}`,
`history.{title,toggle,empty,overlap,status.*}`, `empty.{title,body}`,
`error.title`, `degraded.{badge,reason.*}`.

**Видаляємо `brief.block.blast`, `brief.blast.comingSoon`, `brief.blast.comingSoonHint`.**
Перевірено `grep`ом: усі три читає **лише** картка-заглушка, яку ми переписуємо.
Ключ повідомлення в односмовному застосунку, без експорту й без зовнішнього
споживача, — не спільна межа, тож `deprecation-policy` тут не спрацьовує.
`brief.block.{intent,risks,history}` не чіпаємо — вони належать майбутньому
повному PR Brief.

---

## 5 · MCP: розкрити заглушку

| Файл | Зміна |
|---|---|
| `src/ports.ts` | `BlastRadiusRow` (+ вкладені рядки) і `getBlastRadius(prId, signal)` у `DevDigestApi` |
| `src/http/schemas.ts` | `BlastRadiusRowSchema` — `.passthrough()` на **кожному** рівні + compile-time `Extends<…>` проти `BlastRadiusResponse` (саме це робить дрейф контракту помилкою typecheck) |
| `src/http/client.ts` | `GET /pulls/${prId}/blast-radius`, `config.requestTimeoutMs` |
| `src/format/compact.ts` | `toBlastPayload` із детермінованим пре-капом `BLAST_MAX_SYMBOLS = 10`, `BLAST_MAX_CALLERS_PER_SYMBOL = 5` і `sanitizeText` — `capPayload` лишається лише запобіжником |
| `src/tools/get-blast-radius.ts` | `resolveRepo` → `resolvePr` → `api.getBlastRadius` → `BlastRadiusResult.parse` → `capPayload`; `catch → ctx.mapError(err)` |
| `src/instructions.ts` | прибрати речення про заглушку |

`mcp/src/blast/contract.ts` **не змінюється** — це і є виграш від плаского
конверта. Зрізані zod'ом `repo`/`pr`/`endpoints_affected`/`crons_affected`/`truncated`
домержуємо **після** `.parse()`, як уже робиться з `repo`/`pr`.

**Нова `DESCRIPTION`** (ліміт `MAX_DESCRIPTION_CHARS = 320`):
> `Blast radius of a pull request: the symbols it changes, who calls them, and which HTTP endpoints and cron jobs those callers own. Read-only. Returns a degraded best-effort result when the repository is not indexed.`

**214 символів** — виміряти й вписати виміряне, не вгадане.

**Вартість резолву — свідомий розворот попереднього рішення.** Спека мотивувала
«нуль API-викликів» тим, що інструмент-ноуп не має права оплачувати
`GET /repos/:id/pulls` (це водночас шлях імпорту з GitHub, `pulls/routes.ts:31`).
Тепер відповідь реальна: та сама ціна, яку вже платять `run_agent_on_pr` і
`get_findings`; TTL-кеш `resolve/cache.ts` дедуплікує її в межах сесії; на
серверному боці синк деградує мʼяко (persisted PR віддаються, якщо GitHub недосяжний).
**Відкинуто:** новий дешевий роут `GET /repos/:id/pulls/by-number/:n` — це нова
публічна HTTP-поверхня (MINOR + доки + тести) заради обходу вже помʼякшеної ціни.
Застаріле обґрунтування в `docs/tool-surface.md` треба **переписати**, а не лишити.

**Снапшоти, що впадуть навмисно** — це очікуваний перепін, не регресія:

| тест | було | стане |
|---|---|---|
| довжина опису | `"get_blast_radius": 180` | `214` |
| розмір `tools/list` | `3243` | ~`3277` (< 3500 ✓) |
| `INSTRUCTIONS.length` | `1278` | ~`1274` |
| resident-токени / `TOOL_ORDER` | — | без змін |

Числа з `tools/list` та `INSTRUCTIONS` **виміряти прогоном**, а не арифметикою
(апостроф у реченні робить ручний підрахунок ненадійним) — скопіювати те, що
запропонує vitest.

`test/helpers/fake-api.ts`: додати `'getBlastRadius'` у `FakeApiMethod` і
`emptyCalls()`, `blastByPr` + `seedBlast(prId, row)`, кидати
`fake-api: no blast seeded for pr …` коли не засіяно (як `getConventions`).

`test/mcp-integration.test.ts:298-319` переписати — вся суть старого тесту в
«кожен лічильник === 0». Три кейси: happy path (`degraded:false`, ехо `repo`/`pr`,
`listRepos===1 && listPulls===1 && getBlastRadius===1`); деградований (`degraded:true`,
`isError:false`); невідоме репо → `isError:true` з підказкою `list repos`.

`test/format.test.ts:193-216` — strip-тест лишається, але перенацілити на
реалістичне тіло (з `history`, `endpoints_affected`, `repo`, `pr`) і додати тест
капів `toBlastPayload`.

Доки: `mcp/README.md:42,55`, `mcp/docs/tool-surface.md:134-163`, `mcp/CLAUDE.md`,
амендмент до `mcp/specs/2026-08-14-devdigest-mcp.md` (історію не переписуємо),
буллет «поза скоупом» у `docs/plans/2026-08-14-devdigest-mcp.md:455`.
`.mcp.json` не змінюється.

---

## 6 · Тести

**server** (`test/`, пласко — колокованих тестів під `src/modules/` тут немає):

- `blast-assemble.test.ts` — групування за `viaSymbol`; dedup; порядок за rank;
  атрибуція з `factsByFile`; деградований шлях (per-symbol порожньо, roll-up ==
  `impactedEndpoints`, крони `[]`); капи (30→20 каллерів; 40→`MAX_DOWNSTREAM`,
  причому символи з каллерами переживають зріз); символ із нулем каллерів усе одно
  дає запис у `downstream`; `truncated` спрацьовує на `ENGINE_CALLER_CAP`; чотири
  варіанти `summary`; зібраний DTO чисто `safeParse`иться.
- `blast-service.test.ts` — фейкові порти: немає PR → `undefined` (404);
  `getChangedPaths` передається в рушій дослівно; нуль шляхів → рушій **не**
  викликано, `reason:'no_files'`; маппінг history (`merged_at` ← `updatedAt` →
  `openedAt`, `notes` ← `status`, `files_overlap` кап 5); зламана модель → `AppError`
  зі `statusCode 500`, і це **не** `ZodError` (інакше обробник дав би 422).
- `blast.it.test.ts` — testcontainers, самопропускний через `dockerAvailable()`;
  `container.repoIntel` інжектимо через `ContainerOverrides.repoIntel`
  (`platform/container.ts:50,114`), тож індексер не запускається. Перевіряємо
  200 + форму, історію за спаданням перетину, виключення поточного PR, чужого репо
  й чужого workspace, 404 на невідомий uuid, 422 на не-uuid.
- `routes-smoke.test.ts` — **окремий `it(...)` блок** (глобального списку роутів
  там немає, `server/INSIGHTS.md:39`).
- `contracts.test.ts` — round-trip `BlastRadiusResponse` на повному фікстурі.

**client** (колоковано): `BlastRadiusCard.test.tsx` — `vi.mock("@/lib/hooks/blast")`,
локальний `renderWithIntl` з `messages={{blast}}`, цикл по `["dark","light"]`,
`afterEach(cleanup)`. Кейси: loading; error + retry; порожньо; обидві гілки
плюрала (`1 endpoint` / `2 endpoints`); розкриття символу кліком **і** з
клавіатури (Enter та Space); перемикання Tree↔Graph із перевіркою `aria-selected`
і появи `getByRole("img")`; граф на 20 каллерах — вузлів ≤ капу **і** є `+N more`;
Prior PRs згорнуті за замовчуванням; `degraded` з невідомою причиною падає у
`degraded.reason.unknown` без винятку; `truncated` → `20+ callers`.
**Скрізь `fireEvent`, ніколи `element.click()`** — сирий клік не флашить
React-стан і мовчки провалив би три найважливіші кейси (`client/INSIGHTS.md:14`).
Плюс `helpers.test.ts` — чисті `parseEndpoint` / `ellipsize` / `layoutGraph`.

**mcp** — див. §5.

**e2e** — змін не потрібно: перевірено, жоден `e2e/specs/*.flow.json` не торкається
вкладки Overview і не асертить «coming soon».

---

## 7 · Порядок і перевірка

| # | Задача | Залежить |
|---|---|---|
| T0 | Скопіювати цей план у `docs/plans/2026-08-16-blast-radius.md` — щоб `implementer` і `plan-verifier` мали свій артефакт за конвенцією репо | — |
| T1 | Контракт `BlastRadiusResponse` + байт-ідентичне дзеркало | T0 |
| T2 | Два індекси на `pr_files` → `db:generate` → `db:migrate` | T0 |
| T3 | Слайс `blast/` + запис у `modules/index.ts` | T1, T2 |
| T4 | Seed репо-інтел рядків + другий PR для Prior PRs | T2 |
| T5 | Серверні тести (unit + `.it`) + блок у `routes-smoke` | T3, T4 |
| T6 | Хук + картка + підкомпоненти + i18n + видалення `brief.blast.*` | T1, T3 |
| T7 | Клієнтські тести | T6 |
| T8 | MCP: порт → схема → клієнт → формат → інструмент → інструкції → fake-api → перепін снапшотів → доки | T3 |
| T9 | Спеки `server/specs/2026-08-16-blast-radius.md`, `client/specs/…`, амендмент `mcp/specs/…`; рядок L04 у `README.md`; `TESTING.md`; `scripts/verify-l04.sh` | T5, T7, T8 |
| T10 | `engineering-insights` у `server/`, `client/`, `mcp/` | T9 |

T6 і T8 незалежні один від одного — можна паралелити після T3.

Кожну задачу виконує субагент `implementer`, зобовʼязаний перед кодом викликати
профільний скіл: `zod` + `semver-discipline` (T1), `drizzle-orm-patterns` +
`postgresql-table-design` (T2), `onion-architecture` (T3),
`frontend-ui-architecture` + `react-best-practices` (T6),
`react-testing-library` (T7), `mermaid-diagram` (діаграми в T9).

### Команди

```sh
# контракт і дзеркало
diff -q server/src/vendor/shared/contracts/review-api.ts \
        client/src/vendor/shared/contracts/review-api.ts

# server
cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'
cd server && pnpm exec vitest run .it.test          # потрібен Docker
# онійон ніхто не проганяє автоматично — довести руками один раз:
cd server && npx depcruise \
  --config ../.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs src \
  | grep 'modules/blast'                            # має бути порожньо

# client (build — окремий крок: typecheck+test зелені ≠ збирається)
cd client && pnpm typecheck && pnpm test
lsof -ti:3000 || (cd client && pnpm build)

cd mcp && npm run typecheck && npm test && npm run inspect
cd reviewer-core && npm run typecheck
cd e2e && npm run typecheck

./scripts/verify-l04.sh    # новий, за зразком scripts/verify-l03.sh
```

### Наскрізна перевірка руками

```sh
docker compose up -d
cd server && pnpm db:migrate && pnpm db:seed && pnpm dev
cd client && pnpm dev
```

Відкрити `http://localhost:3000/repos/<repoId>/pulls/482?tab=overview`. Картка
BLAST RADIUS має показати стат-рядок, розкривні `rateLimit()` / `bucketKey()` з
каллер-рядками, бейджі ендпоінтів і крона, перемикач Tree/Graph і розкривну
секцію Prior PRs — тобто макет.

MCP — запускати **з кореня репо**, не з `mcp/` (bin-шим уже одного разу ламався
саме тому, що всі перевірки бігли зсередини `mcp/`):
`mcp__devdigest__get_blast_radius(repo: "acme/payments-api", pr: 482)` має
повернути реальні символи й `degraded:false`.

---

## 8 · Ризики

1. **`MAX_CALLERS_PER_SYMBOL = 20` в repo-intel ріже масив `callers` глобально, а
   не по символу** — сорт за `rank desc`, потім `.slice(0, 20)` по всьому масиву.
   PR на 10 символів може повернути 20 каллерів одного «гарячого» символу і
   `0 callers` для решти девʼяти, і картка подасть це як факт. Це найбільша
   загроза коректності. Помʼякшення: прапорець `truncated` + рендер `20+` +
   копірайт `degraded.reason.unknown`. Справжнє виправлення — зріз по символу в
   `repo-intel`, тобто зміна чужого слайсу; **поза обсягом**, у follow-up.
2. **`ENGINE_CALLER_CAP = 20` — константа, скопійована руками.** blast не може
   імпортувати `repo-intel/constants.ts`. Прокоментувати джерело й додати
   серверний тест, що пінить значення, щоб дрейф хоч було видно в дифі.
   Автоматично його не спіймає ніщо.
3. **`factsByFile` ключований тільки файлом-КАЛЛЕРОМ.** PR, що редагує обробник
   роуту без зовнішніх викликів, покаже `0 endpoints`, хоч очевидно чіпає ендпоінт.
   Саме тому текст порожнього стану — «traced to these callers», а не «affected».
   Follow-up: домержити факти й самих змінених файлів.
4. **`crons_affected` завжди порожній на деградованому шляху** — ripgrep-фолбек
   викликає лише `extractEndpoints`. `N cron` читатиме `0` для непроіндексованого
   репо. Це очікувано, і бейдж `partial` — те, що це пояснює.
5. **depcruise не підключений**: `server/.dependency-cruiser.cjs` не існує і жоден
   скрипт його не кличе — усі правила онійону тут на чесному слові.
6. **next-intl падає на відсутньому ключі**, а `reason` і `notes` — відкриті
   рядки з сервера. Без known-set нова `DegradedReason` на сервері стане помилкою
   рендера на клієнті.
7. **У SVG немає `text-overflow`** — `text-overflow: ellipsis` мовчки нічого не
   зробить, і підпис вилізе за межі картки.
8. **`array_agg(DISTINCT …)` у Drizzle** потребує явного `sql<string[]>`; зріз до
   5 робити в JS.
9. **MCP-снапшоти впадуть за задумом** — їх треба виміряти й вписати, а не
   «полагодити».

## 9 · Чого не встановлено

- Чи достатньо `extractCrons` (евристика по регулярках) ловить крони на реальному
  репо — на seed це керовані дані.
- Наскільки повний персистентний шлях на справжньому проєкті: він рахує каллером
  лише посилання з ненульовим `references.decl_file`, свідомо обираючи точність
  над повнотою. Перевіряти на реально проіндексованому репо, не лише на seed.
- Чи варто піднімати `MAX_CALLERS_PER_SYMBOL` — рішення потребує заміру, а не
  аргументу.

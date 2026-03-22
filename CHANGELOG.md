# Changelog

## [1.1.4] - 2026-03-22

### Added
- 11 tool handler integration tests (MockMcpServer pattern): Zod validation, count capping, format defaulting, prefs error handling, history clear dispatch
- `clearHistory()` no-prune-side-effect fix: `saveRaw()` for direct writes without pruning unrelated sections
- `_fetchEvents()` shared private method in SeqClient — deduplicates `search()` and `recent()` endpoint calls
- `respond()` shared helper in `src/tools/utils.ts` — replaces identical function in 7 tool files
- `"undefined"` string guard on all HTTP methods — prevents literal `"undefined"` from reaching Seq API
- `fieldValuesCache` size cap at 50 entries — prevents unbounded memory growth
- `Array.isArray()` validation on `/api/events` responses — clear error instead of cryptic crash

### Fixed
- `loadPrefs()` returned mutable reference to cache on fresh-load path — now returns defensive copy on both cached and fresh paths
- `DEFAULTS.hideFields` array shared by reference — now deep-copied in all `loadPrefs()` code paths
- `getEvent()` eventId path interpolation — now uses `encodeURIComponent()` to prevent path injection
- `clearHistory("queries")` was pruning old systems as side-effect — uses `saveRaw()` now
- `recent.ts` + `stream.ts` count cap added (200 and 100 respectively) — was uncapped
- `tools/prefs.ts` unknown key now returns error message instead of throwing
- `historyPath()` lazy evaluation — removed module-level constant, path resolved fresh on every call
- `seq_get_event` now passes prefs to `formatEvents()` (consistent with other tools)
- `formatCompact` variable names `first`/`last` renamed to `oldest`/`newest` for clarity
- NDJSON whitespace-only lines filtered before `JSON.parse` attempt
- `rangeStartUtc` describe() removed false "Default: last 24h" claim

---

## [1.1.3] - 2026-03-22

### Added
- 10 additional unit tests (47 → 57): NDJSON parsing, date-based prune, count=0 guards, unknown format throw
- Module-level prefs cache with 60s TTL — max 1 disk read per minute
- `clearPrefsCache()` export for test isolation
- `validatePositiveInt()` helper for numeric pref validation

### Fixed
- `count=0` silent behavioral difference — Zod `.min(1)` validation + defense-in-depth early return
- `updatePref()` fragile if/else chain → exhaustive switch/case with `never` guard
- `loadPrefs()` called 2× per `recordQuery()` — prefs now loaded once and passed through
- `formatEvents()` accepts optional `prefs` param — callers load prefs once instead of twice
- `loadPrefs()` cache returned mutable reference — now returns shallow copy
- Test env: `SEQ_SERVER_URL` set in vitest setup to prevent stderr spam
- `DEFAULTS` exported from prefs.ts — test no longer maintains local copy
- `emptyResponse()` test helper for HTTP 204 (no body parsing)
- `toBeLessThanOrEqual(3)` → `toBe(3)` for exact off-by-one detection

---

## [1.1.2] - 2026-03-22

### Added
- 47 automated unit tests (vitest) — prefs, formatter, history, client
- CLAUDE.md in repo root with full architecture docs

### Fixed
- `count: 0` falsy-check in search/recent/scan — `if (opts.count)` skipped count:0
- NDJSON parser crash on malformed lines — now logs and skips instead of crashing
- `formatDetail()` called `loadPrefs()` per event — prefs now loaded once and passed as param
- `seq_stream` afterId param removed — scan endpoint scans backwards, was misleading
- `hideFields` validation in `updatePref()` — requires string, splits to array
- Switch exhaustiveness in `tools/history.ts` — explicit `never` guard on default
- `seq_prefs_update` tool double-split bug — tool pre-split hideFields to array before passing to `updatePref` which expected a string
- Client-specific references removed from TESTING.md (public repo compliance)
- Unit test aligned with hideFields validation change (string→array split)

---

## [1.1.1] - 2026-03-22

### Added
- ESLint with TypeScript ESLint recommended rules (no-unused-vars, no-explicit-any)
- seq_query_help tool — inline filter + SQL reference docs
- History tools: seq_history, seq_history_clear with filter, retention, per-server scoping

### Fixed
- API key moved from URL query param to X-Seq-ApiKey header (security)
- defaultFormat pref validated against allowed values before save
- formatEvents switch gets default case (no silent undefined on corrupt prefs)
- historyPath() catch block logs to console.error instead of silent swallow
- seq_fields cache key includes sampleSize (prevents stale cache hits)
- seq_search count param now enforced server-side (max 200 cap)
- Client name removed from tool parameter examples (guidelines compliance)
- seq_stream llmTip updated with afterId backward-scan warning
- seq_prefs output shows valid values per key
- recordQuery sort robustness improved

---

## [1.0.0] - 2026-03-19

### Added
- 10 MCP tools: seq_search, seq_get_event, seq_recent, seq_stream, seq_signals, seq_query, seq_expression_indexes, seq_fields, seq_prefs, seq_prefs_update
- Formatter with 4 output modes: compact, table, detail, raw
- MessageTemplateTokens rendering with property resolution
- SQL query support via /api/data endpoint
- Expression indexes via /api/expressionindexes
- Field discovery by sampling events
- Preferences system (~/.seq-mcp-prefs.json)
- In-memory caching: signals (10 min), expression indexes (10 min), field values (10 min)
- Multiple signal combination with comma separation

### Fixed
- Properties handled in both array [{Name, Value}] and object {Key: Value} formats
- 400 responses from /api/data parsed as structured errors instead of throwing
- Signal + level filter conflict documented (signal-m33301 already includes Fatal)

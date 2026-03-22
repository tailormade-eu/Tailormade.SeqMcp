# Changelog

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

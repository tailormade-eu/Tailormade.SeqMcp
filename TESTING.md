# Testing Checklist — Seq MCP

Status: ✅ Tested | ⚠️ Partial | ❌ Not tested

---

## Search

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_search` | Structured filter (`@Level = 'Error'`) | ✅ | Returns correct error events |
| `seq_search` | `@Message like '%keyword%'` filter | ✅ | Correct text search |
| `seq_search` | filter + signal combined | ✅ | Signal scoping works |
| `seq_search` | Multiple signals combined | ✅ | Comma-separated signal IDs work |
| `seq_search` | Signals without extra level filter | ✅ | Error signals include Fatal. Adding `@Level = 'Error'` excludes Fatal events. |
| `seq_search` | Date range (startedAt/endedAt) | ✅ | API uses `fromDateUtc`/`toDateUtc`, tool translates. |
| `seq_search` | count param | ✅ | Correctly limits results |
| `seq_search` | No results | ✅ | Returns "No events." |
| `seq_search` | format=compact (default) | ✅ | Shows timestamp, level, system, path, message |
| `seq_search` | format=table | ✅ | Columnar output |
| `seq_search` | format=raw | ✅ | Full JSON |
| `seq_get_event` | Get single event by ID | ✅ | Detail format with all properties |
| `seq_get_event` | Invalid event ID | ✅ | Returns clear error |

## Signals

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_signals` | List all signals | ✅ | Returns 26 signals in table format. Cached 10 min. |
| `seq_signals` | format=detail | ✅ | Shows ID, title, description, filter per signal |
| `seq_signals` | format=raw | ✅ | Full JSON with all signal properties |

## Recent

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_recent` | Fetch recent events (no afterId) | ✅ | Returns latest events |
| `seq_recent` | Poll with afterId | ✅ | Returns events newer than specified event ID |
| `seq_recent` | filter + signal combined | ✅ | Works correctly |
| `seq_recent` | count param | ✅ | Correctly limits results |

## Stream

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_stream` | Long-poll for new events | ✅ | Uses /api/events/scan with wait param (NDJSON) |
| `seq_stream` | filter + signal combined | ✅ | Works correctly |
| `seq_stream` | records query in history | ✅ | filter + systems recorded in history after scan |
| `seq_stream` | afterId scanning | ⚠️ | afterId on scan endpoint scans BACKWARDS, not forward. Use seq_recent for forward polling. |
| `seq_stream` | No new events (empty response) | ⚠️ | Short wait + non-existent filter gives "fetch failed" — network timeout. Acceptable edge case. |

## Query

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_query` | Basic query (select count) | ✅ | `select count(*) from stream group by System` — 49 systems found |
| `seq_query` | With rangeStartUtc | ✅ | Required for large datasets to avoid timeout |
| `seq_query` | Without rangeStartUtc | ✅ | Timeout on `distinct()` over full stream — expected |
| `seq_query` | With signal | ✅ | Multiple signals comma-separated works |
| `seq_query` | format=raw | ✅ | Returns full JSON with Columns, Rows, Statistics |
| `seq_query` | format=table (default) | ✅ | Columnar output with row count |
| `seq_query` | Invalid SQL | ✅ | Returns structured error with Reasons: "unexpected identifier, expected stream". Fixed: 400 response parsed as QueryResult. |
| `seq_query_help` | Returns inline reference docs | ✅ | Full filter + SQL reference returned |
| `seq_query_help` | Contains ci, regex, Has(), in, now()-1d, SQL structure | ✅ | All sections present and correct |

## Expression Indexes

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_expression_indexes` | List indexes | ✅ | Returns 2 indexes: @EventType, @TraceId. Cached 10 min. |
| `seq_expression_indexes` | format=raw | ✅ | Full JSON with Id and Links |

## Fields

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_fields` | Discover fields for a system | ✅ | `System = 'MediaFilesMigration'` — found 18 fields with sample values |
| `seq_fields` | sampleSize param | ✅ | sampleSize=10 works, returns correct sample count |
| `seq_fields` | Caching | ✅ | Same filter returns cached result within 10 min TTL |

## Preferences

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_prefs` | Show preferences | ✅ | Returns JSON with hideFields, defaultFormat, maxMessageLength |
| `seq_prefs_update` | Update defaultFormat | ✅ | Changed to "table", verified, reverted |
| `seq_prefs_update` | Update maxMessageLength | ✅ | Changed to 200, verified, reverted to 120 |
| `seq_prefs_update` | Update hideFields | ✅ | Changed to "ProcessId,ThreadId", verified, reverted |
| `seq_prefs_update` | Update historyQueryKeepDays | ✅ | Changed to 30, verified, reverted to 60 |
| `seq_prefs_update` | Update historySystemKeepDays | ✅ | Changed to 60, verified |
| `seq_prefs_update` | Update maxHistoryQueries | ✅ | Changed to 10, verified, reverted to 500 |
| `seq_prefs_update` | Invalid key | ✅ | Returns "Unknown preference: invalidKey" |
| `seq_prefs_update` | Non-numeric value for numeric key | ✅ | `historyQueryKeepDays = "banana"` → "must be a number" |
| `seq_prefs_update` | Negative value for keepDays | ✅ | `historyQueryKeepDays = -5` → "must be a positive integer (got: -5)" |
| `seq_prefs_update` | Float value for integer key | ✅ | `maxHistoryQueries = 0.5` → "must be a positive integer (got: 0.5)" |

## History

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_history` | Show empty cache | ✅ | Returns "(none yet)" for both sections |
| `seq_history` | Show after seq_search calls | ✅ | AramisMarketplace + CardoenExportAramis properties populated |
| `seq_history` | File scoped per SEQ_SERVER_URL hostname | ✅ | `~/.seq-mcp-history-seq.datosonline.be.json` |
| `seq_history_clear` | Clear all | ✅ | Both queries and systems emptied |
| `seq_history_clear` | Clear queries only | ✅ | Systems retained, queries gone |
| `seq_history_clear` | Clear systems only | ✅ | Queries retained, systems gone |
| `seq_history_clear` | Clear specific system | ✅ | AramisMarketplace removed, others retained |
| `seq_history_clear` | Clear queries_older_than | ✅ | 0 removed (all recent) — correct |
| `seq_history_clear` | Unknown system | ✅ | Returns "System not found: NonExistent" |
| `seq_history` | filter param (matching) | ✅ | `filter=Datos` → DatosServicesLegacy only + matching queries |
| `seq_history` | filter param (no match) | ✅ | No filter → all systems + all queries |
| `seq_history` | maxHistoryQueries cap (via prefs) | ✅ | Set to 10 via seq_prefs_update, applied on next recordQuery |

## Formatter

| Feature | Test | Status | Notes |
|---------|------|--------|-------|
| MessageTemplateTokens rendering | PropertyName resolution | ✅ | `{RequestMethod}` → `PATCH`, `{StatusCode}` → `500` |
| MessageTemplateTokens rendering | FormattedValue | ✅ | `{Elapsed:0.0000}` → `68.7377` |
| Properties as array | `[{Name, Value}]` format | ✅ | System, RequestPath correctly extracted |
| Properties as object | `{Key: Value}` format | ✅ | Also handled |
| Compact format | Time + Level + System + Path + Message | ✅ | |
| Table format | Columnar with headers | ✅ | |
| Detail format | Full event with properties | ✅ | |
| Exception truncation | First 3 lines in compact | ✅ | |
| maxMessageLength | Truncation at 120 chars | ✅ | |

## Lint

| Check | Test | Status | Notes |
|-------|------|--------|-------|
| ESLint | `npm run lint` (eslint src/ + tsc --noEmit) | ✅ | TypeScript ESLint recommended rules, no-unused-vars (error), no-explicit-any (warn) |
| Build | `npm run build` | ✅ | Still compiles cleanly after ESLint setup |

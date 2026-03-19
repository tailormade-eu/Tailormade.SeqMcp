# Testing Checklist — Seq MCP

Status: ✅ Tested | ⚠️ Partial | ❌ Not tested

---

## Search

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_search` | Structured filter (`@Level = 'Error'`) | ✅ | Returns correct error events |
| `seq_search` | `@Message like '%keyword%'` filter | ✅ | Correct text search |
| `seq_search` | filter + signal combined | ✅ | signal-354 (Production) works |
| `seq_search` | Multiple signals combined | ✅ | `signal-1382,signal-m33301,signal-354` — comma-separated works |
| `seq_search` | Signals without extra level filter | ✅ | signal-m33301 includes Error + Fatal. Adding `@Level = 'Error'` excludes Fatal events. |
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
| `seq_stream` | afterId scanning | ⚠️ | afterId on scan endpoint scans BACKWARDS, not forward. Use seq_recent for forward polling. |
| `seq_stream` | No new events (empty response) | ⚠️ | Short wait + non-existent filter gives "fetch failed" — network timeout. Acceptable edge case. |

## Query

| Tool | Test | Status | Notes |
|------|------|--------|-------|
| `seq_query` | Basic query (select count) | ✅ | `select count(*) from stream group by System` — 49 systems found |
| `seq_query` | With rangeStartUtc | ✅ | Required for large datasets to avoid timeout |
| `seq_query` | Without rangeStartUtc | ✅ | Timeout on `distinct()` over full stream — expected |
| `seq_query` | With signal | ✅ | `signal-1382,signal-m33301,signal-354` works |
| `seq_query` | format=raw | ✅ | Returns full JSON with Columns, Rows, Statistics |
| `seq_query` | format=table (default) | ✅ | Columnar output with row count |
| `seq_query` | Invalid SQL | ✅ | Returns structured error with Reasons: "unexpected identifier, expected stream". Fixed: 400 response parsed as QueryResult. |

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
| `seq_prefs_update` | Invalid key | ✅ | Returns "Unknown preference: invalidKey" |

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

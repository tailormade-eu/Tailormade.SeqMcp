# Seq MCP — Claude/CodingMachine Instructions

This file provides context for AI agents (Claude Code, CodingMachine) working on this codebase.

---

## Architecture

### Entry Point

`src/index.ts` — creates MCP server, registers all tools, initializes SeqClient, starts stdio transport.

### Tool Registration

Each domain has its own file in `src/tools/`. Export a `register*Tools(server, client)` function and import it in `src/index.ts`.

```
src/tools/search.ts     → registerSearchTools   (seq_search, seq_get_event)
src/tools/signals.ts    → registerSignalTools    (seq_signals)
src/tools/recent.ts     → registerRecentTools    (seq_recent)
src/tools/stream.ts     → registerStreamTools    (seq_stream)
src/tools/query.ts      → registerQueryTools     (seq_query, seq_query_help, seq_expression_indexes, seq_fields)
src/tools/prefs.ts      → registerPrefsTools     (seq_prefs, seq_prefs_update)
src/tools/history.ts    → registerHistoryTools   (seq_history, seq_history_clear)
```

### API Layer

```
src/api/client.ts       → SeqClient — HTTP calls, caching (signals 10min, indexes 10min, field values 10min)
src/api/formatter.ts    → Event/signal formatting (compact, table, detail, raw)
src/api/prefs.ts        → Preferences (~/.seq-mcp-prefs.json)
src/api/history.ts      → History cache (~/.seq-mcp-history-{hostname}.json)
```

### Auth

- `SeqClient` in `src/api/client.ts`
- Uses `X-Seq-ApiKey` header on all HTTP requests
- Env vars: `SEQ_SERVER_URL`, `SEQ_API_KEY`
- API key must be a **service account key** (not user-bound) — user-bound keys require browser login

### API Endpoints Used

| Endpoint | Method | Permission | Used by |
|----------|--------|------------|---------|
| `/api/events` | GET | Read | seq_search, seq_recent |
| `/api/events/{id}` | GET | Read | seq_get_event |
| `/api/events/scan` | GET | Read | seq_stream |
| `/api/signals` | GET | Read | seq_signals |
| `/api/data` | POST | Read | seq_query |
| `/api/expressionindexes` | GET | Read | seq_expression_indexes |

### Formatter

`src/api/formatter.ts` — central formatter with 4 modes:
- **compact** (default search/recent/stream): timestamp, level, system, path, message
- **table** (default signals): columnar output
- **detail** (default get_event): full event with all properties
- **raw**: original JSON

Handles Seq Properties in both formats: flat object `{Key: Value}` and array `[{Name, Value}]`.

### Preferences

`~/.seq-mcp-prefs.json` — loaded on every formatter call:
- `defaultFormat`: compact|table|detail|raw
- `maxMessageLength`: truncation limit (default 120)
- `hideFields`: fields hidden in detail view (default: ProcessId, ThreadId, EventId)
- `historyQueryKeepDays`: query retention in days (default 60)
- `historySystemKeepDays`: system/property retention in days (default 60)
- `maxHistoryQueries`: max query entries in history (default 500)

### History Cache

`~/.seq-mcp-history-{hostname}.json` — auto-populated on every `seq_search`:
- Discovered `System` names + their property names per system
- Recent filter patterns with timestamp
- Scoped per `SEQ_SERVER_URL` hostname → no cross-client pollution
- Auto-pruned on save based on prefs retention settings

---

## Known API quirks

| Quirk | Details |
|-------|---------|
| `q` param | The `q` API param does NOT reliably search message content. Always use `filter` with `@Message like '%keyword%'` for text search. |
| API key auth | Service account keys work standalone. User-bound keys return empty results. |
| Signal IDs | Format is `signal-NNN`, discoverable via `/api/signals?shared=true` |
| Event IDs | Format is `event-{hex}`, used for get-event and afterId polling |
| Date params (events) | Seq API uses `fromDateUtc`/`toDateUtc`. The tool translates `startedAt`/`endedAt` automatically. |
| Date params (query) | `/api/data` uses `rangeStartUtc`/`rangeEndUtc` as query params. |
| afterId on /events | Forward polling — pass last event's Id to get newer events. |
| afterId on /events/scan | BACKWARDS from that point, not forward. Use seq_recent for forward polling. |
| scan format | Returns NDJSON, client parses automatically. |
| SQL queries | Use `from stream` not `from events`. Set `rangeStartUtc` to avoid timeouts. |
| Properties format | Events may return Properties as `[{Name, Value}]` array or flat `{Key: Value}` object. Formatter handles both. |

---

## Adding or improving a tool

1. Find the tool in `src/tools/{category}.ts`
2. Update the description string (second arg to `server.tool()`)
3. Add/update `llmTip` in the description for API quirks
4. Ensure every param has `.describe()` with format + constraints
5. Run `npm run build`

---

## Language Rules

- ALL tool descriptions (`server.tool()` second argument): **English**
- ALL parameter `.describe()` strings: **English**
- ALL `respond()` output text: **English**
- Comments in code: **English preferred**

---

## Zod type coercion

All numeric params use `z.coerce.number()` so string values from MCP clients are accepted.

---

## Development

### Build
```bash
npm run build
```

### Test
```bash
npm test          # vitest run (47 unit tests)
npm run lint      # eslint + tsc --noEmit
```

### Run in dev mode
```bash
SEQ_SERVER_URL=http://localhost:5341 SEQ_API_KEY=xxx npm run dev
```

### MCP client config
```json
{
  "mcpServers": {
    "seq": {
      "command": "node",
      "args": ["node_modules/@tailormade/seq-mcp/dist/index.js"],
      "env": {
        "SEQ_SERVER_URL": "https://your-seq-server",
        "SEQ_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## Tool categories

| File | Tools | Count |
|------|-------|-------|
| search.ts | seq_search, seq_get_event | 2 |
| signals.ts | seq_signals | 1 |
| recent.ts | seq_recent | 1 |
| stream.ts | seq_stream | 1 |
| query.ts | seq_query, seq_query_help, seq_expression_indexes, seq_fields | 4 |
| prefs.ts | seq_prefs, seq_prefs_update | 2 |
| history.ts | seq_history, seq_history_clear | 2 |

**Total: 13 tools**

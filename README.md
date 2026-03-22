# @tailormade/seq-mcp

MCP server for [Seq](https://datalust.co/seq) structured logging — search, query, signals, live events.

## Stack

- TypeScript, Node.js >= 20
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) ^1.5.0
- [Zod](https://www.npmjs.com/package/zod) ^4.3.6

## Setup

```bash
npm install @tailormade/seq-mcp
```

Set environment variables:

```
SEQ_SERVER_URL=https://your-seq-server
SEQ_API_KEY=your-api-key
```

### Claude Desktop / MCP config

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

## API Key Permissions

The API key needs specific Seq permissions depending on which tools you want to use:

| Permission | Tools |
|------------|-------|
| **Read** | All tools |

Minimum required: **Read**.

## Tools

| Tool | Description | Default format |
|------|-------------|---------------|
| `seq_search` | Search events by filter, signal, date range | compact |
| `seq_get_event` | Get single event by ID with full details | detail |
| `seq_recent` | Fetch most recent events, supports polling with afterId | compact |
| `seq_stream` | Long-poll for new events (real-time monitoring) | compact |
| `seq_signals` | List all shared signals (cached 10 min) | table |
| `seq_query` | Execute SQL queries (`select ... from stream`) | table |
| `seq_expression_indexes` | List expression indexes | table |
| `seq_fields` | Discover fields by sampling events (cached 10 min) | - |
| `seq_query_help` | Inline filter + SQL reference docs | - |
| `seq_prefs` | Show current preferences | - |
| `seq_prefs_update` | Update a preference | - |
| `seq_history` | Show cached query history and discovered systems | - |
| `seq_history_clear` | Clear history cache (all, queries, systems, or specific) | - |

## Output Formats

All event tools support a `format` parameter: `compact`, `table`, `detail`, `raw`.

Default format is configurable via `seq_prefs_update key=defaultFormat value=compact`.

## Preferences

Stored in `~/.seq-mcp-prefs.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `defaultFormat` | `compact` | Default output format for event tools |
| `maxMessageLength` | `120` | Truncate messages in compact/table mode |
| `hideFields` | `ProcessId,ThreadId,EventId` | Fields hidden in detail view |
| `historyQueryKeepDays` | `60` | Auto-prune query history older than N days |
| `historySystemKeepDays` | `60` | Auto-prune system entries older than N days |
| `maxHistoryQueries` | `500` | Max query entries to keep in history |

## Architecture

```
src/
├── index.ts              Entry point — MCP server + tool registration
├── api/
│   ├── client.ts         SeqClient — HTTP calls + caching
│   ├── formatter.ts      Event/signal formatting (compact/table/detail/raw)
│   ├── prefs.ts          Preferences (~/.seq-mcp-prefs.json)
│   └── history.ts        History cache (~/.seq-mcp-history-{hostname}.json)
└── tools/
    ├── search.ts          seq_search, seq_get_event
    ├── signals.ts         seq_signals
    ├── recent.ts          seq_recent
    ├── stream.ts          seq_stream
    ├── query.ts           seq_query, seq_query_help, seq_expression_indexes, seq_fields
    ├── prefs.ts           seq_prefs, seq_prefs_update
    └── history.ts         seq_history, seq_history_clear
```

## References

- [Seq HTTP API](https://datalust.co/docs/server-http-api) — Datalust
- [Seq SQL query syntax](https://datalust.co/docs/sql-queries) — Datalust
- [seq-api C# client](https://github.com/datalust/seq-api) — Datalust (reference for endpoint behavior)
- [MCP specification](https://modelcontextprotocol.io/) — Anthropic

## Known limitations

- `afterId` on `/api/events/scan` scans backwards, not forward — use `seq_recent` for forward polling
- `seq_stream` with very short wait + non-matching filter can cause fetch timeout
- SQL `distinct()` over full stream may timeout — always set `rangeStartUtc`
- `seq_fields` discovers fields by sampling — fields that appear rarely may be missed with small sample sizes
- Properties format varies between Seq versions (array vs object) — formatter handles both

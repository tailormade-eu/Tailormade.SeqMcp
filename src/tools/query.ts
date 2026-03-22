import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function formatQueryResult(result: { Columns?: string[]; Rows?: unknown[][]; Error?: string; Suggestion?: string }): string {
  if (result.Error) {
    let msg = `Error: ${result.Error}`;
    if (result.Suggestion) msg += `\nSuggestion: ${result.Suggestion}`;
    return msg;
  }
  if (!result.Columns || !result.Rows || result.Rows.length === 0) return "No results.";

  const cols = result.Columns;
  const rows = result.Rows;

  // Calculate column widths
  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => String(r[i] ?? "").length))
  );

  // Cap widths at 40
  const capped = widths.map((w) => Math.min(w, 40));

  const hdr = cols.map((c, i) => c.padEnd(capped[i])).join(" | ");
  const sep = capped.map((w) => "-".repeat(w)).join("-|-");
  const body = rows.map((r) =>
    cols.map((_, i) => {
      const val = String(r[i] ?? "");
      return val.length > capped[i] ? val.slice(0, capped[i] - 3) + "..." : val.padEnd(capped[i]);
    }).join(" | ")
  );

  return [`${rows.length} rows`, "", hdr, sep, ...body].join("\n");
}

const QUERY_HELP = `# Seq Query Reference

## Filter Syntax (seq_search, seq_recent, seq_stream, seq_fields)

### Comparison operators
  =  <>  <  <=  >  >=
  Application = 'MyApp'
  @Level <> 'Warning'
  @Elapsed > 500

### Case-insensitive matching — ci postfix modifier
  Application = 'myapp' ci           -- matches 'MyApp', 'MYAPP', etc.
  @Message like '%error%' ci

### Pattern matching — like / not like
  @Message like '%keyword%'          -- % = any chars, _ = one char
  @Message like '%timeout%' and @Level = 'Error'
  @Message not like '%healthcheck%'

### Regular expressions
  Source = /(Microsoft|System).*Internal/

### IN operator
  @Level in ['Warning', 'Error']
  Application in ['Web', 'API']

### Null / property existence
  Has(RequestPath)                   -- property exists
  RequestPath is not null
  RequestPath is null

### Collection indexers
  Tags[?] like 'seq%'                -- [?] = any element matches
  Tags[*] = 'required'               -- [*] = all elements match

### Dot notation for nested properties
  Cart.Total > 100

### Logical operators
  System = 'X' and @Level = 'Error'
  System = 'X' or System = 'Y'
  not @Level = 'Information'

### String functions (scalar)
  StartsWith(RequestPath, '/api')
  EndsWith(RequestPath, '.jpg')
  Contains(@Message, 'timeout')
  Substring(@Message, 0, 50)
  ToUpper(Application)  ToLower(Application)
  Length(@Message) > 200

### Date/time
  @Timestamp > DateTime('2026-03-18T00:00:00Z')
  @Timestamp > now() - 1d            -- relative: 30d, 1h, 60s, 500ms

### Built-in event properties
  @Timestamp   @Message   @MessageTemplate   @Level
  @Exception   @EventType @Properties        @Id
  @TraceId     @SpanId    @ParentId

### Conditional
  if @Level = 'Error' then 1 else 0

---

## SQL Syntax (seq_query)

CRITICAL: use 'from stream' — NOT 'from events'
WARNING: always set rangeStartUtc — without it the query scans all time and will timeout

### Structure
  select <expressions>
  from stream
  [where <filter>]
  [group by <dimensions>]
  [having <aggregate_filter>]
  [order by <col> asc|desc]
  [limit <n>]

### Count / group
  select count(*) from stream limit 50
  select count(*) from stream group by System limit 50
  select count(*) from stream group by System, @Level limit 50
  select count(*) from stream where @Level = 'Error' group by System

### Aggregations
  select mean(Elapsed) from stream group by RequestPath
  select percentile(Elapsed, 95) from stream group by System
  select min(Elapsed), max(Elapsed), mean(Elapsed) from stream group by System
  select sum(Elapsed) from stream where System = 'X' group by RequestPath

### Distinct
  select distinct(System) from stream limit 50
  select count(distinct(UserId)) from stream group by System

### Time grouping
  select count(*) from stream group by time(1h)
  select count(*) from stream group by time(5m)
  select mean(Elapsed) from stream where System = 'X' group by time(1h)

### First / last value
  select first(RequestPath) from stream group by @EventType limit 20

### Strings: always single-quoted

---

## Signals

Signal IDs are instance-specific — always call seq_signals first to find the right IDs.
Signals filter events server-side (faster than filter expressions for large volumes).
Combine multiple signals with comma: signal-AAA,signal-BBB

WARNING: do NOT add @Level = 'Error' when using error signals — signals already include Fatal.
Adding the level filter excludes Fatal events.
WARNING: @Level = 'Error' alone can return 0 results on some systems — prefer an error signal.

---

## Recommended Workflow

1. seq_history      — check if system/properties already cached
2. seq_signals      — discover available signals (errors, environments, etc.)
3. seq_fields       — discover available properties for a system
4. seq_search       — search with filter + optional signal
5. seq_query        — aggregate/count queries
`;

export function registerQueryTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_query_help",
    "Returns inline reference documentation for Seq filter syntax, SQL syntax, signals, and recommended workflow. Use this before building a filter or query on an unfamiliar system.",
    {},
    async () => respond(QUERY_HELP)
  );

  server.tool(
    "seq_query",
    "Execute a SQL query against Seq event data. Returns tabular results. Supports SELECT, COUNT, DISTINCT, GROUP BY, ORDER BY, LIMIT.\n\nllmTip: CRITICAL: use `from stream` not `from events` — wrong table name returns empty results. NOTE: strings are single-quoted. WARNING: always set rangeStartUtc — without it the query scans all time and will timeout on large datasets. EXAMPLE: `select count(*) from stream group by System limit 50` | `select count(*) from stream where System = 'MyApp' group by RequestPath` | `select count(*) from stream where @Level = 'Error' group by System`.",
    {
      q: z.string().describe("SQL query. Must use 'from stream'. Example: select distinct(System) from stream limit 50"),
      rangeStartUtc: z.string().optional().describe("Start of time range, ISO8601. Optional. If omitted, Seq searches the full event stream (may time out on large datasets — recommended to always provide)"),
      rangeEndUtc: z.string().optional().describe("End of time range, ISO8601"),
      signal: z.string().optional().describe("Signal ID to scope the query. Use seq_signals to discover available IDs."),
      timeout: z.coerce.number().optional().describe("Query timeout in ms (default 30000)"),
      format: z.enum(["table", "raw"]).optional().describe("Output format: table (default) or raw JSON"),
    },
    async (params) => {
      const result = await client.query({
        q: params.q,
        rangeStartUtc: params.rangeStartUtc,
        rangeEndUtc: params.rangeEndUtc,
        signal: params.signal,
        timeout: params.timeout ?? 30000,
      });
      if (params.format === "raw") return respond(JSON.stringify(result, null, 2));
      return respond(formatQueryResult(result));
    }
  );

  server.tool(
    "seq_expression_indexes",
    "List expression indexes configured in Seq. These define which fields have dedicated indexes for fast querying.\n\nllmTip: NOTE: only indexed fields (@EventType, @TraceId) benefit from fast lookups. For field discovery, use seq_query with `group by` or seq_fields instead.",
    {
      format: z.enum(["table", "raw"]).optional().describe("Output format: table (default) or raw JSON"),
    },
    async (params) => {
      const exprIndexes = await client.listExpressionIndexes();

      if (params.format === "raw") return respond(JSON.stringify(exprIndexes, null, 2));

      if (exprIndexes.length === 0) return respond("No expression indexes configured.");

      const w = Math.max(10, ...exprIndexes.map((i) => i.Expression.length));
      const lines = [
        `${exprIndexes.length} expression indexes`, "",
        ["Expression".padEnd(w), "Description"].join(" | "),
        ["-".repeat(w), "-".repeat(11)].join("-|-"),
        ...exprIndexes.map((i) => [i.Expression.padEnd(w), i.Description ?? ""].join(" | ")),
      ];
      return respond(lines.join("\n"));
    }
  );

  server.tool(
    "seq_fields",
    "Discover which properties/fields a system (or filter) logs by sampling recent events. Shows field names and sample values. Cached 10 min.\n\nllmTip: NOTE: fields vary per system, environment, and event type — increase sampleSize for better coverage. NOTE: also check seq_history for already-discovered properties before calling this. EXAMPLE: follow up with seq_query: `select count(*) from stream where System = 'X' group by FieldName` for exact value counts.",
    {
      filter: z.string().describe("Seq filter expression, e.g. System = 'MyApp' or System = 'MyApp' and @Level = 'Error'"),
      sampleSize: z.coerce.number().optional().describe("Number of events to sample (default 20, max 100). More = better coverage but slower."),
    },
    async (params) => {
      const size = Math.min(params.sampleSize ?? 20, 100);
      const { fields, sampleCount } = await client.discoverFields(params.filter, size);
      const entries = Object.entries(fields).sort((a, b) => b[1].size - a[1].size);

      if (entries.length === 0) return respond("No fields found (no events matched the filter).");

      const lines: string[] = [
        `${entries.length} fields found (sampled ${sampleCount} events)`,
        "",
      ];

      for (const [field, values] of entries) {
        const vals = [...values];
        const preview = vals.slice(0, 5).join(", ");
        const more = vals.length > 5 ? ` (+${vals.length - 5} more)` : "";
        lines.push(`${field} (${vals.length} unique):`);
        lines.push(`  ${preview}${more}`);
        lines.push("");
      }

      return respond(lines.join("\n").trimEnd());
    }
  );
}

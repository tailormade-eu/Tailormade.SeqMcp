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

export function registerQueryTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_query",
    "Execute a SQL query against Seq event data. Returns tabular results. Supports SELECT, COUNT, DISTINCT, GROUP BY, ORDER BY, LIMIT.\n\nllmTip: Seq SQL uses `from stream` (not `from events`). Single-quoted strings. IMPORTANT: always set rangeStartUtc to avoid timeouts on large datasets. Examples: `select count(*) from stream group by System limit 50`, `select count(*) from stream where System = 'MyApp' group by RequestPath`, `select count(*) from stream where @Level = 'Error' group by System`.",
    {
      q: z.string().describe("SQL query. Must use 'from stream'. Example: select distinct(System) from stream limit 50"),
      rangeStartUtc: z.string().optional().describe("Start of time range, ISO8601. Default: last 24h"),
      rangeEndUtc: z.string().optional().describe("End of time range, ISO8601"),
      signal: z.string().optional().describe("Signal ID to scope the query, e.g. signal-354"),
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
    "List expression indexes configured in Seq. These define which fields have dedicated indexes for fast querying.\n\nllmTip: Expression indexes speed up queries on specific fields. Currently only @EventType and @TraceId are indexed. For field discovery, use seq_query with `group by` instead.",
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
    "Discover which properties/fields a system (or filter) logs by sampling recent events. Shows field names and sample values. Cached 10 min.\n\nllmTip: This samples the last N events matching the filter and extracts all property names + sample values. Fields vary per system, environment, and event type — increase sampleSize for better coverage. Use after seq_search to understand what fields are available for filtering. For exact value counts, follow up with seq_query: `select count(*) from stream where System = 'X' group by FieldName`.",
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

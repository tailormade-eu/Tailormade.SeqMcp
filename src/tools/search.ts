import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const formatParam = z.enum(["compact", "table", "detail", "raw"]).optional()
  .describe("Output format: compact (default), table, detail, or raw (full JSON)");

export function registerSearchTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_search",
    "Search Seq events by filter, signal, and/or date range. Returns newest first (compact format). Next steps: seq_get_event for full details, seq_signals to discover signals, seq_query for aggregations.\n\nllmTip: Text search: `@Message like '%keyword%'`. Structured: `Environment = 'Production'`, `@Level = 'Error'`. Combine with `and`/`or`. Date params are ISO8601 UTC. Use seq_signals to find signal IDs (e.g. signal-354). Always set startedAt for better performance. WARNING: do NOT add `@Level = 'Error'` filter when using error signals (e.g. signal-m33301) — signals already filter on level and include Fatal. Adding the filter would exclude Fatal events. Combine multiple signals with comma: `signal-1382,signal-m33301,signal-354`.",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: Environment = 'Production', @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by, e.g. signal-354. Use seq_signals to discover available signal IDs."),
      count: z.coerce.number().optional().describe("Max events to return (default 20, max 200)"),
      startedAt: z.string().optional().describe("Only events after this timestamp. ISO8601 format, e.g. 2026-03-18T00:00:00Z"),
      endedAt: z.string().optional().describe("Only events before this timestamp. ISO8601 format, e.g. 2026-03-19T00:00:00Z"),
      format: formatParam,
    },
    async (params) => {
      const events = await client.search({
        filter: params.filter,
        signal: params.signal,
        count: params.count ?? 20,
        startedAt: params.startedAt,
        endedAt: params.endedAt,
      });
      const mode: FormatMode = params.format ?? loadPrefs().defaultFormat;
      return respond(formatEvents(events, mode));
    }
  );

  server.tool(
    "seq_get_event",
    "Get a single Seq event by ID with full rendered message and all properties (detail format). Use after seq_search, seq_recent, or seq_stream to inspect a specific event.\n\nllmTip: Event IDs look like 'event-34070bec858e08de73ab2ef100000000'. You get these from the Id field in search/recent/stream results.",
    {
      eventId: z.string().describe("The full event ID, e.g. event-34070bec858e08de73ab2ef100000000"),
      format: formatParam,
    },
    async (params) => {
      const event = await client.getEvent(params.eventId);
      const mode: FormatMode = params.format ?? "detail";
      return respond(formatEvents([event], mode));
    }
  );
}

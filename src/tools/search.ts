import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";
import { recordQuery } from "../api/history.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const formatParam = z.enum(["compact", "table", "detail", "raw"]).optional()
  .describe("Output format: compact (default), table, detail, or raw (full JSON)");

export function registerSearchTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_search",
    "Search Seq events by filter, signal, and/or date range. Returns newest first. Next steps: seq_get_event for full details, seq_signals to discover signals, seq_query for aggregations, seq_history for known systems/properties.\n\nllmTip: NOTE: before building a filter, call seq_signals to discover available signals (e.g. error signals, environment signals) and seq_history for known systems/properties — avoids blind trial-and-error. EXAMPLE: text search: `@Message like '%keyword%'` | structured: `Environment = 'Production'` | combine: `System = 'X' and @Level = 'Error'`. Date params are ISO8601 UTC. WARNING: always set startedAt — without it Seq scans all time and is slow. WARNING: do NOT add `@Level = 'Error'` filter when using error signals — signals already filter on level; adding it excludes Fatal events. WARNING: `@Level = 'Error'` alone can be unreliable on some systems — prefer an error signal (use seq_signals to find the right one). NOTE: combine multiple signals with comma: `signal-AAA,signal-BBB`.",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: Environment = 'Production', @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by. Use seq_signals to discover available IDs."),
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
      recordQuery({ filter: params.filter, startedAt: params.startedAt, endedAt: params.endedAt }, events);
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

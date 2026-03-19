import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerRecentTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_recent",
    "Fetch the most recent events from Seq (compact format). Use afterId to poll for new events since a previous call. For continuous monitoring, use seq_stream instead.\n\nllmTip: Polling pattern: first call without afterId, then pass the newest event's Id as afterId in subsequent calls. Use `filter` with `@Message like '%keyword%'` for text search, or structured filters like `@Level = 'Error'`.",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by, e.g. signal-354"),
      count: z.coerce.number().optional().describe("Max events to return (default 10)"),
      afterId: z.string().optional().describe("Only return events newer than this event ID. Use for polling: pass the Id of the last event from your previous call."),
      format: z.enum(["compact", "table", "detail", "raw"]).optional()
        .describe("Output format: compact (default), table, detail, or raw (full JSON)"),
    },
    async (params) => {
      const events = await client.recent({
        filter: params.filter,
        signal: params.signal,
        count: params.count ?? 10,
        afterId: params.afterId,
      });
      const mode: FormatMode = params.format ?? loadPrefs().defaultFormat;
      return respond(formatEvents(events, mode));
    }
  );
}

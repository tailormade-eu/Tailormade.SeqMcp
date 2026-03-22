import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";
import { recordQuery } from "../api/history.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerRecentTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_recent",
    "Fetch the most recent events from Seq. Use afterId to poll for new events since a previous call. For continuous monitoring, use seq_stream instead.\n\nllmTip: NOTE: polling pattern — first call without afterId, then pass the newest event Id as afterId in subsequent calls. EXAMPLE: text search: `@Message like '%keyword%'` | structured: `@Level = 'Error'` | combined: `System = 'X' and @Level = 'Error'`.",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by. Use seq_signals to discover available IDs."),
      count: z.coerce.number().min(1).optional().describe("Max events to return (default 10)"),
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
      recordQuery({ filter: params.filter }, events);
      const prefs = loadPrefs();
      const mode: FormatMode = params.format ?? prefs.defaultFormat;
      return respond(formatEvents(events, mode, prefs));
    }
  );
}

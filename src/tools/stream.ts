import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";
import { recordQuery } from "../api/history.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerStreamTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_stream",
    "Wait for new events from Seq using long-polling. Blocks up to `wait` ms for new events. Ideal for real-time monitoring.\n\nllmTip: Pass afterId from a previous seq_recent or seq_stream call to only get NEW events. Without afterId, returns most recent events. Default wait 5000ms, max 10000ms. Use `filter` for text search (`@Message like '%keyword%'`) or structured filters (`@Level = 'Error'`).",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by. Use seq_signals to discover available IDs."),
      count: z.coerce.number().optional().describe("Max events to return (default 10)"),
      afterId: z.string().optional().describe("Only return events newer than this event ID. Pass the Id of the last event from your previous call."),
      wait: z.coerce.number().optional().describe("Max milliseconds to wait for new events (default 5000, max 10000)"),
      format: z.enum(["compact", "table", "detail", "raw"]).optional()
        .describe("Output format: compact (default), table, detail, or raw (full JSON)"),
    },
    async (params) => {
      const wait = Math.min(params.wait ?? 5000, 10000);
      const events = await client.scan({
        filter: params.filter,
        signal: params.signal,
        count: params.count ?? 10,
        afterId: params.afterId,
        wait,
      });
      if (events.length === 0) return respond("No new events within the wait period.");
      recordQuery({ filter: params.filter }, events);
      const mode: FormatMode = params.format ?? loadPrefs().defaultFormat;
      return respond(formatEvents(events, mode));
    }
  );
}

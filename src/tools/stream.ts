import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatEvents, FormatMode } from "../api/formatter.js";
import { loadPrefs } from "../api/prefs.js";
import { recordQuery } from "../api/history.js";
import { respond } from "./utils.js";

export function registerStreamTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_stream",
    "Wait for new events from Seq using long-polling. Blocks up to `wait` ms for new events. Ideal for real-time monitoring.\n\nllmTip: Returns the most recent events matching your filter. Default wait 5000ms, max 10000ms. Use `filter` for text search (`@Message like '%keyword%'`) or structured filters (`@Level = 'Error'`). For forward polling with afterId, use seq_recent instead.",
    {
      filter: z.string().optional().describe("Seq filter expression. For text search: @Message like '%keyword%'. For structured: @Level = 'Error'. Combine with and/or."),
      signal: z.string().optional().describe("Signal ID to filter by. Use seq_signals to discover available IDs."),
      count: z.coerce.number().min(1).optional().describe("Max events to return (default 10, max 100)"),
      wait: z.coerce.number().optional().describe("Max milliseconds to wait for new events (default 5000, max 10000)"),
      format: z.enum(["compact", "table", "detail", "raw"]).optional()
        .describe("Output format: compact (default), table, detail, or raw (full JSON)"),
    },
    async (params) => {
      const wait = Math.min(params.wait ?? 5000, 10000);
      const events = await client.scan({
        filter: params.filter,
        signal: params.signal,
        count: Math.min(params.count ?? 10, 100),
        afterId: undefined,
        wait,
      });
      if (events.length === 0) return respond("No new events within the wait period.");
      recordQuery({ filter: params.filter }, events);
      const prefs = loadPrefs();
      const mode: FormatMode = params.format ?? prefs.defaultFormat;
      return respond(formatEvents(events, mode, prefs));
    }
  );
}

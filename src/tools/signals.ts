import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeqClient } from "../api/client.js";
import { formatSignals, FormatMode } from "../api/formatter.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerSignalTools(server: McpServer, client: SeqClient): void {
  server.tool(
    "seq_signals",
    "List all available Seq signals (cached 10 min). Signals are saved filters/groups like 'Production', 'Errors', 'Warnings'. Use the returned signal ID in seq_search, seq_recent, seq_stream, or seq_query.\n\nllmTip: Call this first to discover which signals exist before filtering. Signal IDs are stable and look like 'signal-NNN'. Signals can be combined with filter expressions.",
    {
      format: z.enum(["compact", "table", "detail", "raw"]).optional()
        .describe("Output format: table (default), detail, or raw (full JSON)"),
    },
    async (params) => {
      const signals = await client.listSignals();
      const mode: FormatMode = params.format ?? "table";
      return respond(formatSignals(signals, mode));
    }
  );
}

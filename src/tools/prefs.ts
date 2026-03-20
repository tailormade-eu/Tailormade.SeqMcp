import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadPrefs, updatePref } from "../api/prefs.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerPrefsTools(server: McpServer): void {
  server.tool(
    "seq_prefs",
    "Show current Seq MCP preferences (output format, hidden fields, message length, history retention days).",
    {},
    async () => {
      const prefs = loadPrefs();
      return respond(JSON.stringify(prefs, null, 2));
    }
  );

  server.tool(
    "seq_prefs_update",
    "Update a Seq MCP preference. Valid keys: defaultFormat (compact|table|detail|raw), maxMessageLength (number), hideFields (comma-separated list), historyQueryKeepDays (number, default 60), historySystemKeepDays (number, default 60), maxHistoryQueries (number, default 500).",
    {
      key: z.string().describe("Preference key: defaultFormat, maxMessageLength, hideFields, historyQueryKeepDays, historySystemKeepDays, or maxHistoryQueries"),
      value: z.string().describe("New value. For hideFields use comma-separated list, e.g. 'ProcessId,ThreadId'"),
    },
    async (params) => {
      let parsed: unknown = params.value;
      if (params.key === "maxMessageLength" || params.key === "historyQueryKeepDays" || params.key === "historySystemKeepDays" || params.key === "maxHistoryQueries") {
        parsed = Number(params.value);
        if (isNaN(parsed as number)) throw new Error(`${params.key} must be a number`);
      } else if (params.key === "hideFields") {
        parsed = params.value.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const prefs = updatePref(params.key, parsed);
      return respond(`Updated. Current preferences:\n${JSON.stringify(prefs, null, 2)}`);
    }
  );
}

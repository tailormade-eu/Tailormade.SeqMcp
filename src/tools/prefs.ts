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
      const lines = [
        "Current preferences (valid values shown):",
        `  defaultFormat: compact | table | detail | raw  [current: ${prefs.defaultFormat}]`,
        `  maxMessageLength: positive integer  [current: ${prefs.maxMessageLength}]`,
        `  hideFields: comma-separated field names  [current: ${prefs.hideFields.join(", ")}]`,
        `  historyQueryKeepDays: positive integer  [current: ${prefs.historyQueryKeepDays}]`,
        `  historySystemKeepDays: positive integer  [current: ${prefs.historySystemKeepDays}]`,
        `  maxHistoryQueries: positive integer  [current: ${prefs.maxHistoryQueries}]`,
      ];
      return respond(lines.join("\n"));
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
      const value: unknown = params.key === "hideFields"
        ? params.value.split(",").map((s) => s.trim()).filter(Boolean)
        : params.value;
      const prefs = updatePref(params.key, value);
      return respond(`Updated. Current preferences:\n${JSON.stringify(prefs, null, 2)}`);
    }
  );
}

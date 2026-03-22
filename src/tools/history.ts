import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadHistory, clearHistory, clearSystem, clearQueriesOlderThan, historyFile } from "../api/history.js";

function respond(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerHistoryTools(server: McpServer): void {
  server.tool(
    "seq_history",
    "Show cached query history and discovered Seq systems/properties. Auto-built from previous seq_search calls. Scoped per Seq server (separate file per SEQ_SERVER_URL). Use to find known System names, property names per system, and recent filter patterns.\n\nllmTip: NOTE: call this before seq_fields or writing a new filter — known systems and properties may already be resolved. NOTE: retention is configurable via seq_prefs_update: historyQueryKeepDays, historySystemKeepDays, maxHistoryQueries (defaults 60/60/500). NOTE: each Seq server gets its own cache file — no cross-client pollution.",
    {
      filter: z.string().optional().describe("Optional text filter (case-insensitive). When provided, shows only systems and queries whose name, filter, or systems contain this term."),
    },
    async (params) => {
      const h = loadHistory();
      const lines: string[] = [`file: ${historyFile()}`, ""];
      const term = params.filter?.toLowerCase();

      // Systems + properties
      const systemEntries = Object.entries(h.systems)
        .filter(([system]) => !term || system.toLowerCase().includes(term));
      if (systemEntries.length > 0) {
        lines.push("## Known Systems & Properties");
        for (const [system, entry] of systemEntries) {
          const lastUsed = entry.lastUsed.slice(0, 10);
          lines.push(`\n### ${system} (last used: ${lastUsed})`);
          lines.push(entry.properties.join(", "));
        }
        lines.push("");
      } else {
        lines.push("## Known Systems & Properties\n(none yet)\n");
      }

      // Recent queries
      lines.push("## Recent Queries");
      const queries = h.queries.filter((q) =>
        !term ||
        (q.filter ?? "").toLowerCase().includes(term) ||
        q.systems.some((s) => s.toLowerCase().includes(term))
      );
      if (queries.length === 0) {
        lines.push("(none yet)");
      } else {
        for (const q of queries) {
          const date = q.usedAt.slice(0, 16).replace("T", " ");
          const sys = q.systems.length ? ` [${q.systems.join(", ")}]` : "";
          lines.push(`\n${date}${sys}`);
          if (q.filter) lines.push(`  filter: ${q.filter}`);
          if (q.startedAt) lines.push(`  from:   ${q.startedAt}`);
          if (q.endedAt) lines.push(`  to:     ${q.endedAt}`);
        }
      }

      return respond(lines.join("\n"));
    }
  );

  server.tool(
    "seq_history_clear",
    "Clear the local Seq history cache.\n\nllmTip: NOTE: 'all'/'queries'/'systems' need no extra params. NOTE: use 'system' + system param to remove one specific system (e.g. after a client offboards). NOTE: use 'queries_older_than' + days param for a manual retention sweep outside the auto-prune cycle.",
    {
      what: z.enum(["all", "queries", "systems", "system", "queries_older_than"]).describe("'all' = everything | 'queries' = query history only | 'systems' = all discovered systems/properties | 'system' = one system by name (requires system param) | 'queries_older_than' = queries older than N days (requires days param)"),
      system: z.string().optional().describe("System name to remove. Only used when what='system'. e.g. 'MyApp'"),
      days: z.coerce.number().min(1).optional().describe("Number of days threshold. Only used when what='queries_older_than'. e.g. 30"),
    },
    async (params) => {
      switch (params.what) {
        case "system": {
          if (!params.system) throw new Error("system parameter is required");
          const found = clearSystem(params.system);
          return respond(found ? `Cleared system: ${params.system}` : `System not found: ${params.system}`);
        }
        case "queries_older_than": {
          if (params.days == null) throw new Error("days parameter is required");
          const removed = clearQueriesOlderThan(params.days);
          return respond(`Removed ${removed} queries older than ${params.days} days`);
        }
        case "all":
        case "queries":
        case "systems":
          clearHistory(params.what);
          return respond(`Cleared: ${params.what} (file: ${historyFile()})`);
        default: {
          const _exhaustive: never = params.what;
          throw new Error(`Unknown what value: ${String(_exhaustive)}`);
        }
      }
    }
  );
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join } from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };
import { SeqClient } from "./api/client.js";
import { registerSearchTools } from "./tools/search.js";
import { registerSignalTools } from "./tools/signals.js";
import { registerRecentTools } from "./tools/recent.js";
import { registerStreamTools } from "./tools/stream.js";
import { registerPrefsTools } from "./tools/prefs.js";
import { registerQueryTools } from "./tools/query.js";
import { registerHistoryTools } from "./tools/history.js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

process.on("unhandledRejection", (err) => {
  console.error(JSON.stringify({ level: "ERROR", op: "process", msg: "Unhandled rejection", error: String(err) }));
  process.exit(1);
});

async function main(): Promise<void> {
  const client = new SeqClient({
    serverUrl: getRequiredEnv("SEQ_SERVER_URL"),
    apiKey: getRequiredEnv("SEQ_API_KEY"),
  });

  const server = new McpServer({ name: "seq-mcp", version });

  registerSearchTools(server, client);
  registerSignalTools(server, client);
  registerRecentTools(server, client);
  registerStreamTools(server, client);
  registerPrefsTools(server);
  registerQueryTools(server, client);
  registerHistoryTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => { console.error(err); process.exit(1); });

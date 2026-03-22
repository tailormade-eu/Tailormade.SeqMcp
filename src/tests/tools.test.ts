import { describe, it, expect, vi, beforeEach } from "vitest";
import { z, ZodObject, ZodRawShape } from "zod";

// --- Mock API dependencies (hoisted above tool imports) ---

vi.mock("../api/formatter.js", () => ({
  formatEvents: vi.fn(() => "formatted-output"),
}));

vi.mock("../api/prefs.js", () => ({
  loadPrefs: vi.fn(() => ({
    hideFields: ["ProcessId", "ThreadId", "EventId"],
    defaultFormat: "compact",
    maxMessageLength: 120,
    historyQueryKeepDays: 60,
    historySystemKeepDays: 60,
    maxHistoryQueries: 500,
  })),
  updatePref: vi.fn(),
}));

vi.mock("../api/history.js", () => ({
  recordQuery: vi.fn(),
  loadHistory: vi.fn(() => ({ queries: [], systems: {} })),
  clearHistory: vi.fn(),
  clearSystem: vi.fn(),
  clearQueriesOlderThan: vi.fn(),
  historyFile: vi.fn(() => "/mock/history.json"),
}));

import { formatEvents } from "../api/formatter.js";
import { loadPrefs, updatePref } from "../api/prefs.js";
import { clearHistory } from "../api/history.js";
import { registerSearchTools } from "../tools/search.js";
import { registerRecentTools } from "../tools/recent.js";
import { registerStreamTools } from "../tools/stream.js";
import { registerPrefsTools } from "../tools/prefs.js";
import { registerHistoryTools } from "../tools/history.js";

// --- Mock MCP server that captures tool registrations ---

type ToolResult = { content: { type: string; text: string }[] };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

interface CapturedTool {
  schema: ZodObject<ZodRawShape>;
  handler: ToolHandler;
}

const tools: Record<string, CapturedTool> = {};

const mockServer = {
  tool: (_name: string, _desc: string, shape: ZodRawShape, handler: ToolHandler) => {
    tools[_name] = { schema: z.object(shape), handler };
  },
};

// --- Mock SeqClient ---

const mockClient = {
  search: vi.fn().mockResolvedValue([]),
  recent: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
  getEvent: vi.fn().mockResolvedValue({ Id: "event-1" }),
};

// --- Register all tools ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server = mockServer as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = mockClient as any;

registerSearchTools(server, client);
registerRecentTools(server, client);
registerStreamTools(server, client);
registerPrefsTools(server);
registerHistoryTools(server);

// --- Helper ---

async function callTool(name: string, params: Record<string, unknown> = {}): Promise<string> {
  const tool = tools[name];
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  const validated = tool.schema.parse(params);
  const result = await tool.handler(validated);
  return result.content[0].text;
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.search.mockResolvedValue([]);
  mockClient.recent.mockResolvedValue([]);
  mockClient.scan.mockResolvedValue([]);
  vi.mocked(formatEvents).mockReturnValue("formatted-output");
  vi.mocked(loadPrefs).mockReturnValue({
    hideFields: ["ProcessId", "ThreadId", "EventId"],
    defaultFormat: "compact",
    maxMessageLength: 120,
    historyQueryKeepDays: 60,
    historySystemKeepDays: 60,
    maxHistoryQueries: 500,
  });
});

describe("seq_search", () => {
  it("count defaults to 20 when not provided", async () => {
    await callTool("seq_search", { filter: "@Level = 'Error'" });
    expect(mockClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ count: 20 }),
    );
  });

  it("count is capped at 200", async () => {
    await callTool("seq_search", { count: 999 });
    expect(mockClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ count: 200 }),
    );
  });

  it("format defaults to defaultFormat from prefs", async () => {
    vi.mocked(loadPrefs).mockReturnValue({
      hideFields: [],
      defaultFormat: "table",
      maxMessageLength: 120,
      historyQueryKeepDays: 60,
      historySystemKeepDays: 60,
      maxHistoryQueries: 500,
    });
    await callTool("seq_search", {});
    expect(formatEvents).toHaveBeenCalledWith(
      expect.anything(), "table", expect.anything(),
    );
  });

  it("invalid format value triggers Zod validation error", () => {
    const result = tools["seq_search"].schema.safeParse({ format: "invalid_format" });
    expect(result.success).toBe(false);
  });
});

describe("seq_recent", () => {
  it("count defaults to 10 when not provided", async () => {
    await callTool("seq_recent", {});
    expect(mockClient.recent).toHaveBeenCalledWith(
      expect.objectContaining({ count: 10 }),
    );
  });

  it("count is capped at 200", async () => {
    await callTool("seq_recent", { count: 500 });
    expect(mockClient.recent).toHaveBeenCalledWith(
      expect.objectContaining({ count: 200 }),
    );
  });
});

describe("seq_stream", () => {
  it("count is capped at 100", async () => {
    await callTool("seq_stream", { count: 500 });
    expect(mockClient.scan).toHaveBeenCalledWith(
      expect.objectContaining({ count: 100 }),
    );
  });
});

describe("seq_prefs_update", () => {
  it("unknown key returns error message", async () => {
    vi.mocked(updatePref).mockImplementation(() => {
      throw new Error("Unknown preference: invalidKey");
    });
    const text = await callTool("seq_prefs_update", { key: "invalidKey", value: "x" });
    expect(text).toContain("Error:");
    expect(text).toContain("Unknown preference");
    expect(text).toContain("invalidKey");
  });

  it("valid update returns confirmation", async () => {
    vi.mocked(updatePref).mockReturnValue({
      defaultFormat: "table",
      maxMessageLength: 120,
      hideFields: [],
      historyQueryKeepDays: 60,
      historySystemKeepDays: 60,
      maxHistoryQueries: 500,
    });
    const text = await callTool("seq_prefs_update", { key: "defaultFormat", value: "table" });
    expect(text).toContain("Updated");
    expect(text).toContain("table");
  });
});

describe("seq_history_clear", () => {
  it("what=queries calls clearHistory with queries", async () => {
    const text = await callTool("seq_history_clear", { what: "queries" });
    expect(clearHistory).toHaveBeenCalledWith("queries");
    expect(text).toContain("queries");
  });

  it("what=systems calls clearHistory with systems", async () => {
    const text = await callTool("seq_history_clear", { what: "systems" });
    expect(clearHistory).toHaveBeenCalledWith("systems");
    expect(text).toContain("systems");
  });
});

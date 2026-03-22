import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs before importing history module
let fileStore: Record<string, string> = {};

vi.mock("fs", () => ({
  existsSync: vi.fn((path: string) => path in fileStore),
  readFileSync: vi.fn((path: string) => fileStore[path] ?? ""),
  writeFileSync: vi.fn((path: string, data: string) => {
    fileStore[path] = data;
  }),
}));

vi.mock("./prefs.js", () => ({
  loadPrefs: vi.fn(() => ({
    hideFields: [],
    defaultFormat: "compact",
    maxMessageLength: 120,
    historyQueryKeepDays: 60,
    historySystemKeepDays: 60,
    maxHistoryQueries: 500,
  })),
}));

import { loadHistory, recordQuery, clearHistory, historyFile } from "./history.js";
import { loadPrefs } from "./prefs.js";

beforeEach(() => {
  fileStore = {};
});

describe("loadHistory", () => {
  it("returns empty history when no file", () => {
    const h = loadHistory();
    expect(h.queries).toEqual([]);
    expect(h.systems).toEqual({});
  });
});

describe("prune", () => {
  it("removes entries older than keepDays", () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();
    const path = historyFile();

    fileStore[path] = JSON.stringify({
      queries: [
        { filter: "old", usedAt: oldDate, systems: [] },
        { filter: "recent", usedAt: recentDate, systems: [] },
      ],
      systems: {
        OldSystem: { properties: ["A"], lastUsed: oldDate },
        RecentSystem: { properties: ["B"], lastUsed: recentDate },
      },
    });

    // Trigger save (which calls prune) via clearHistory
    clearHistory("queries");
    // After clearing queries, reload
    const h = loadHistory();
    // queries were cleared explicitly
    expect(h.queries).toEqual([]);
    // OldSystem should be pruned, RecentSystem kept
    expect(h.systems).not.toHaveProperty("OldSystem");
    expect(h.systems).toHaveProperty("RecentSystem");
  });

  it("keeps entries within keepDays", () => {
    const recentDate = new Date().toISOString();
    const path = historyFile();

    fileStore[path] = JSON.stringify({
      queries: [{ filter: "recent", usedAt: recentDate, systems: [] }],
      systems: { RecentSystem: { properties: ["A"], lastUsed: recentDate } },
    });

    // Trigger prune via recordQuery (which calls save → prune)
    recordQuery({ filter: "new" }, []);
    const h = loadHistory();
    expect(h.systems).toHaveProperty("RecentSystem");
  });
});

describe("recordQuery", () => {
  it("records query with extracted systems", () => {
    recordQuery({ filter: "@Level = 'Error'" }, [
      { Properties: { System: "AppA", RequestPath: "/test" } },
      { Properties: [{ Name: "System", Value: "AppB" }] },
    ]);

    const h = loadHistory();
    expect(h.queries.length).toBe(1);
    expect(h.queries[0].filter).toBe("@Level = 'Error'");
    expect(h.queries[0].systems).toContain("AppA");
    expect(h.queries[0].systems).toContain("AppB");
    expect(h.systems).toHaveProperty("AppA");
    expect(h.systems).toHaveProperty("AppB");
    expect(h.systems["AppA"].properties).toContain("System");
    expect(h.systems["AppA"].properties).toContain("RequestPath");
  });

  it("deduplicates same filter+startedAt+endedAt within last 5", () => {
    recordQuery({ filter: "dup", startedAt: "2026-01-01", endedAt: "2026-01-02" }, []);
    recordQuery({ filter: "dup", startedAt: "2026-01-01", endedAt: "2026-01-02" }, []);

    const h = loadHistory();
    expect(h.queries.length).toBe(1);
  });

  it("allows same filter with different dates", () => {
    recordQuery({ filter: "same", startedAt: "2026-01-01" }, []);
    recordQuery({ filter: "same", startedAt: "2026-02-01" }, []);

    const h = loadHistory();
    expect(h.queries.length).toBe(2);
  });

  it("caps queries at maxHistoryQueries", () => {
    vi.mocked(loadPrefs).mockReturnValue({
      hideFields: [],
      defaultFormat: "compact",
      maxMessageLength: 120,
      historyQueryKeepDays: 60,
      historySystemKeepDays: 60,
      maxHistoryQueries: 3,
    });

    for (let i = 0; i < 5; i++) {
      recordQuery({ filter: `q${i}` }, []);
    }

    const h = loadHistory();
    expect(h.queries.length).toBeLessThanOrEqual(3);
  });

  it("handles Properties as [{Name,Value}] array", () => {
    recordQuery({ filter: "arr" }, [
      { Properties: [{ Name: "System", Value: "ArrApp" }, { Name: "Env", Value: "prod" }] },
    ]);
    const h = loadHistory();
    expect(h.systems["ArrApp"].properties).toContain("System");
    expect(h.systems["ArrApp"].properties).toContain("Env");
  });
});

describe("clearHistory", () => {
  it("clears all", () => {
    recordQuery({ filter: "test" }, [{ Properties: { System: "X" } }]);
    clearHistory("all");
    const h = loadHistory();
    expect(h.queries).toEqual([]);
    expect(h.systems).toEqual({});
  });

  it("clears only queries", () => {
    recordQuery({ filter: "test" }, [{ Properties: { System: "X" } }]);
    clearHistory("queries");
    const h = loadHistory();
    expect(h.queries).toEqual([]);
    expect(Object.keys(h.systems).length).toBeGreaterThan(0);
  });

  it("clears only systems", () => {
    recordQuery({ filter: "test" }, [{ Properties: { System: "X" } }]);
    clearHistory("systems");
    const h = loadHistory();
    expect(h.queries.length).toBeGreaterThan(0);
    expect(h.systems).toEqual({});
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("./prefs.js", () => ({
  loadPrefs: vi.fn(() => ({
    hideFields: ["ProcessId", "ThreadId", "EventId"],
    defaultFormat: "compact",
    maxMessageLength: 120,
    historyQueryKeepDays: 60,
    historySystemKeepDays: 60,
    maxHistoryQueries: 500,
  })),
}));

import { formatEvents, formatSignals, type FormatMode } from "./formatter.js";

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  Id: "event-abc123",
  Timestamp: "2026-03-22T10:30:00.000Z",
  Level: "Error",
  RenderedMessage: "Something went wrong",
  Properties: { System: "TestApp", RequestPath: "/api/test" },
  ...overrides,
});

describe("formatEvents", () => {
  it("empty array returns 'No events.'", () => {
    expect(formatEvents([], "compact")).toBe("No events.");
    expect(formatEvents([], "table")).toBe("No events.");
  });

  it("all 4 format modes return non-empty string", () => {
    const events = [makeEvent()];
    for (const mode of ["compact", "table", "detail", "raw"] as const) {
      const result = formatEvents(events, mode);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  describe("compact format", () => {
    it("contains timestamp, level, system, message", () => {
      const result = formatEvents([makeEvent()], "compact");
      expect(result).toContain("10:30:00");
      expect(result).toContain("ERR");
      expect(result).toContain("TestApp");
      expect(result).toContain("Something went wrong");
    });

    it("contains request path", () => {
      const result = formatEvents([makeEvent()], "compact");
      expect(result).toContain("/api/test");
    });
  });

  describe("table format", () => {
    it("has columnar header", () => {
      const result = formatEvents([makeEvent()], "table");
      expect(result).toContain("Time");
      expect(result).toContain("Level");
      expect(result).toContain("System");
      expect(result).toContain("Message");
    });

    it("correct row count (header + separator + 1 data row)", () => {
      const events = [makeEvent(), makeEvent({ Id: "event-def456" })];
      const result = formatEvents(events, "table");
      const lines = result.split("\n");
      // header + separator + 2 data rows = 4
      expect(lines.length).toBe(4);
    });
  });

  describe("detail format", () => {
    it("shows event ID, level, system, message", () => {
      const result = formatEvents([makeEvent()], "detail");
      expect(result).toContain("event-abc123");
      expect(result).toContain("Error");
      expect(result).toContain("TestApp");
      expect(result).toContain("Something went wrong");
    });

    it("hides fields from hideFields pref", () => {
      const event = makeEvent({
        Properties: { System: "X", ProcessId: "1234", CustomField: "visible" },
      });
      const result = formatEvents([event], "detail");
      expect(result).not.toContain("ProcessId");
      expect(result).toContain("CustomField");
    });
  });

  describe("raw format", () => {
    it("returns valid JSON", () => {
      const events = [makeEvent()];
      const result = formatEvents(events, "raw");
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe("exception truncation", () => {
    it("compact shows first 3 lines of exception", () => {
      const exc = "Error: boom\n  at foo.ts:10\n  at bar.ts:20\n  at baz.ts:30\n  at qux.ts:40";
      const result = formatEvents([makeEvent({ Exception: exc })], "compact");
      expect(result).toContain("Error: boom");
      expect(result).toContain("at bar.ts:20");
      expect(result).not.toContain("at qux.ts:40");
    });
  });

  describe("maxMessageLength", () => {
    it("truncates long messages in compact mode", () => {
      const longMsg = "A".repeat(200);
      const result = formatEvents([makeEvent({ RenderedMessage: longMsg })], "compact");
      expect(result).toContain("A".repeat(120) + "...");
      expect(result).not.toContain("A".repeat(200));
    });

    it("does not truncate in detail mode", () => {
      const longMsg = "B".repeat(200);
      const result = formatEvents([makeEvent({ RenderedMessage: longMsg })], "detail");
      expect(result).toContain("B".repeat(200));
    });
  });

  describe("Properties formats", () => {
    it("handles Properties as {key: value} object", () => {
      const event = makeEvent({ Properties: { System: "ObjApp" } });
      const result = formatEvents([event], "compact");
      expect(result).toContain("ObjApp");
    });

    it("handles Properties as [{Name, Value}] array", () => {
      const event = makeEvent({
        Properties: [
          { Name: "System", Value: "ArrApp" },
          { Name: "RequestPath", Value: "/arr" },
        ],
      });
      const result = formatEvents([event], "compact");
      expect(result).toContain("ArrApp");
      expect(result).toContain("/arr");
    });
  });

  describe("unknown format mode", () => {
    it("throws on unknown mode", () => {
      expect(() => formatEvents([makeEvent()], "banana" as FormatMode)).toThrow("Unknown format mode: banana");
    });
  });

  describe("MessageTemplateTokens", () => {
    it("renders tokens when RenderedMessage is empty", () => {
      const event = makeEvent({
        RenderedMessage: "",
        MessageTemplateTokens: [
          { Text: "Request " },
          { PropertyName: "Method", FormattedValue: "GET" },
          { Text: " completed" },
        ],
        Properties: { System: "X", Method: "GET" },
      });
      const result = formatEvents([event], "compact");
      expect(result).toContain("Request GET completed");
    });
  });
});

describe("formatSignals", () => {
  const signal = { Id: "signal-1", Title: "Errors", Filters: [{ Filter: "@Level = 'Error'" }] };

  it("empty returns 'No signals.'", () => {
    expect(formatSignals([], "table")).toBe("No signals.");
  });

  it("table format has header", () => {
    const result = formatSignals([signal], "table");
    expect(result).toContain("ID");
    expect(result).toContain("Title");
    expect(result).toContain("Filter");
  });

  it("raw returns valid JSON", () => {
    const result = formatSignals([signal], "raw");
    expect(() => JSON.parse(result)).not.toThrow();
  });
});

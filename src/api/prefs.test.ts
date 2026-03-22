import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPrefs, updatePref } from "./prefs.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from "fs";

const DEFAULTS = {
  hideFields: ["ProcessId", "ThreadId", "EventId"],
  defaultFormat: "compact",
  maxMessageLength: 120,
  historyQueryKeepDays: 60,
  historySystemKeepDays: 60,
  maxHistoryQueries: 500,
};

beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(writeFileSync).mockImplementation(() => {});
});

describe("loadPrefs", () => {
  it("returns defaults when no file exists", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadPrefs()).toEqual(DEFAULTS);
  });

  it("merges partial file with defaults", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ maxMessageLength: 200 }));
    const prefs = loadPrefs();
    expect(prefs.maxMessageLength).toBe(200);
    expect(prefs.defaultFormat).toBe("compact"); // default preserved
    expect(prefs.hideFields).toEqual(DEFAULTS.hideFields);
  });

  it("returns defaults on corrupt JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("not json{{{");
    expect(loadPrefs()).toEqual(DEFAULTS);
  });
});

describe("updatePref", () => {
  it("valid defaultFormat saves and returns updated prefs", () => {
    const result = updatePref("defaultFormat", "table");
    expect(result.defaultFormat).toBe("table");
    expect(writeFileSync).toHaveBeenCalled();
  });

  it("invalid defaultFormat throws", () => {
    expect(() => updatePref("defaultFormat", "banana")).toThrow("must be one of");
  });

  it("valid numeric value saves correctly", () => {
    const result = updatePref("maxMessageLength", "200");
    expect(result.maxMessageLength).toBe(200);
  });

  it("invalid numeric value throws", () => {
    expect(() => updatePref("maxMessageLength", "abc")).toThrow("must be a positive integer");
  });

  it("negative numeric value throws", () => {
    expect(() => updatePref("historyQueryKeepDays", -5)).toThrow("must be a positive integer");
  });

  it("float numeric value throws", () => {
    expect(() => updatePref("maxHistoryQueries", 0.5)).toThrow("must be a positive integer");
  });

  it("unknown key throws", () => {
    expect(() => updatePref("unknownKey", "value")).toThrow("Unknown preference");
  });

  it("hideFields string value is stored as-is", () => {
    const result = updatePref("hideFields", "ProcessId,ThreadId");
    expect(result.hideFields).toBe("ProcessId,ThreadId");
  });
});

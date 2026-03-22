import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface SeqPrefs {
  hideFields: string[];
  defaultFormat: "compact" | "table" | "detail" | "raw";
  maxMessageLength: number;
  historyQueryKeepDays: number;
  historySystemKeepDays: number;
  maxHistoryQueries: number;
}

const PREFS_PATH = join(homedir(), ".seq-mcp-prefs.json");

const DEFAULTS: SeqPrefs = {
  hideFields: ["ProcessId", "ThreadId", "EventId"],
  defaultFormat: "compact",
  maxMessageLength: 120,
  historyQueryKeepDays: 60,
  historySystemKeepDays: 60,
  maxHistoryQueries: 500,
};

export function loadPrefs(): SeqPrefs {
  if (!existsSync(PREFS_PATH)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(PREFS_PATH, "utf-8"));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: SeqPrefs): void {
  try {
    writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf-8");
  } catch (e) {
    console.error("seq-mcp: failed to write prefs file:", e);
  }
}

export function updatePref(key: string, value: unknown): SeqPrefs {
  const prefs = loadPrefs();
  if (!(key in DEFAULTS)) throw new Error(`Unknown preference: ${key}`);
  const defaultValue = (DEFAULTS as unknown as Record<string, unknown>)[key];
  if (key === "defaultFormat") {
    const valid = ["compact", "table", "detail", "raw"];
    if (!valid.includes(value as string)) throw new Error(`Invalid value for defaultFormat: must be one of ${valid.join(", ")} (got: ${value})`);
  }
  if (typeof defaultValue === "number") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid value for ${key}: must be a positive integer (got: ${value})`);
    Object.assign(prefs, { [key]: n });
  } else {
    Object.assign(prefs, { [key]: value });
  }
  savePrefs(prefs);
  return prefs;
}

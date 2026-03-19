import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface SeqPrefs {
  hideFields: string[];
  defaultFormat: "compact" | "table" | "detail" | "raw";
  maxMessageLength: number;
}

const PREFS_PATH = join(homedir(), ".seq-mcp-prefs.json");

const DEFAULTS: SeqPrefs = {
  hideFields: ["ProcessId", "ThreadId", "EventId"],
  defaultFormat: "compact",
  maxMessageLength: 120,
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
  writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf-8");
}

export function updatePref(key: string, value: unknown): SeqPrefs {
  const prefs = loadPrefs();
  if (!(key in DEFAULTS)) throw new Error(`Unknown preference: ${key}`);
  (prefs as unknown as Record<string, unknown>)[key] = value;
  savePrefs(prefs);
  return prefs;
}

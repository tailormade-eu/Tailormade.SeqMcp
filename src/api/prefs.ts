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

export const DEFAULTS: SeqPrefs = {
  hideFields: ["ProcessId", "ThreadId", "EventId"],
  defaultFormat: "compact",
  maxMessageLength: 120,
  historyQueryKeepDays: 60,
  historySystemKeepDays: 60,
  maxHistoryQueries: 500,
};

let cachedPrefs: SeqPrefs | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

export function clearPrefsCache(): void {
  cachedPrefs = null;
  cacheTime = 0;
}

export function loadPrefs(): SeqPrefs {
  const now = Date.now();
  if (cachedPrefs && now - cacheTime < CACHE_TTL_MS) return cachedPrefs;

  let result: SeqPrefs;
  if (!existsSync(PREFS_PATH)) {
    result = { ...DEFAULTS };
  } else {
    try {
      const raw = JSON.parse(readFileSync(PREFS_PATH, "utf-8"));
      result = { ...DEFAULTS, ...raw };
    } catch {
      result = { ...DEFAULTS };
    }
  }

  cachedPrefs = result;
  cacheTime = now;
  return result;
}

export function savePrefs(prefs: SeqPrefs): void {
  try {
    writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf-8");
    clearPrefsCache();
  } catch (e) {
    console.error("seq-mcp: failed to write prefs file:", e);
  }
}

type PrefKey = keyof SeqPrefs;

function validatePositiveInt(key: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid value for ${key}: must be a positive integer (got: ${value})`);
  return n;
}

export function updatePref(key: string, value: unknown): SeqPrefs {
  const prefs = loadPrefs();
  if (!(key in DEFAULTS)) throw new Error(`Unknown preference: ${key}`);
  const typedKey = key as PrefKey;

  switch (typedKey) {
    case "defaultFormat": {
      const valid = ["compact", "table", "detail", "raw"];
      if (!valid.includes(value as string)) throw new Error(`Invalid value for defaultFormat: must be one of ${valid.join(", ")} (got: ${value})`);
      prefs.defaultFormat = value as SeqPrefs["defaultFormat"];
      break;
    }
    case "hideFields": {
      if (typeof value !== "string") throw new Error(`Invalid value for hideFields: must be a comma-separated string (got: ${typeof value})`);
      prefs.hideFields = value.split(",").map((s) => s.trim()).filter(Boolean);
      break;
    }
    case "maxMessageLength":
    case "historyQueryKeepDays":
    case "historySystemKeepDays":
    case "maxHistoryQueries": {
      prefs[typedKey] = validatePositiveInt(typedKey, value);
      break;
    }
    default: {
      const _exhaustive: never = typedKey;
      throw new Error(`Unknown preference: ${_exhaustive}`);
    }
  }

  savePrefs(prefs);
  return prefs;
}

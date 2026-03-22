import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadPrefs } from "./prefs.js";

function historyPath(): string {
  const url = process.env.SEQ_SERVER_URL ?? "";
  try {
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_");
    return join(homedir(), `.seq-mcp-history-${host}.json`);
  } catch {
    return join(homedir(), ".seq-mcp-history.json");
  }
}

const HISTORY_PATH = historyPath();

export interface QueryEntry {
  filter?: string;
  startedAt?: string;
  endedAt?: string;
  usedAt: string;
  systems: string[];
}

export interface SystemEntry {
  properties: string[];
  lastUsed: string; // ISO timestamp
}

export interface SeqHistory {
  queries: QueryEntry[];
  systems: Record<string, SystemEntry>;
}

function load(): SeqHistory {
  if (!existsSync(HISTORY_PATH)) return { queries: [], systems: {} };
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return { queries: [], systems: {} };
  }
}

function prune(h: SeqHistory): void {
  const prefs = loadPrefs();
  const ms = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

  const systemCutoff = ms(prefs.historySystemKeepDays);
  for (const [system, entry] of Object.entries(h.systems)) {
    if (new Date(entry.lastUsed).getTime() < systemCutoff) delete h.systems[system];
  }

  const queryCutoff = ms(prefs.historyQueryKeepDays);
  h.queries = h.queries.filter((q) => new Date(q.usedAt).getTime() >= queryCutoff);
}

function save(h: SeqHistory): void {
  prune(h);
  try {
    writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2), "utf-8");
  } catch (e) {
    console.error("seq-mcp: failed to write history file:", e);
  }
}

export function clearHistory(what: "all" | "queries" | "systems"): void {
  const h = load();
  if (what === "all" || what === "queries") h.queries = [];
  if (what === "all" || what === "systems") h.systems = {};
  save(h);
}

export function clearSystem(system: string): boolean {
  const h = load();
  if (!(system in h.systems)) return false;
  delete h.systems[system];
  save(h);
  return true;
}

export function clearQueriesOlderThan(days: number): number {
  const h = load();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const before = h.queries.length;
  h.queries = h.queries.filter((q) => new Date(q.usedAt).getTime() >= cutoff);
  save(h);
  return before - h.queries.length;
}

export function historyFile(): string {
  return HISTORY_PATH;
}

export function loadHistory(): SeqHistory {
  return load();
}

export function recordQuery(
  params: { filter?: string; startedAt?: string; endedAt?: string },
  events: unknown[]
): void {
  const h = load();

  // Extract systems and their properties from results
  const seenSystems = new Set<string>();
  for (const e of events as Record<string, unknown>[]) {
    const p = e.Properties as Record<string, unknown> | { Name: string; Value: unknown }[] | undefined;
    if (!p) continue;

    const propMap: Record<string, unknown> = Array.isArray(p)
      ? Object.fromEntries(p.map(({ Name, Value }) => [Name, Value]))
      : p;

    const system = String(propMap.System ?? propMap.ApplicationName ?? "");
    if (!system) continue;

    seenSystems.add(system);

    const existing = h.systems[system] ?? { properties: [], lastUsed: "" };
    const known = new Set(existing.properties);
    for (const key of Object.keys(propMap)) known.add(key);
    h.systems[system] = { properties: [...known].sort(), lastUsed: new Date().toISOString() };
  }

  // Save query entry (skip duplicates of same filter within last 5)
  const entry: QueryEntry = {
    filter: params.filter,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
    usedAt: new Date().toISOString(),
    systems: [...seenSystems],
  };

  const recent = h.queries.slice(0, 5);
  const isDuplicate = recent.some(
    (q) => q.filter === entry.filter && q.startedAt === entry.startedAt && q.endedAt === entry.endedAt
  );
  if (!isDuplicate) {
    h.queries.unshift(entry);
    h.queries.sort((a, b) => b.usedAt.localeCompare(a.usedAt));
    h.queries = h.queries.slice(0, loadPrefs().maxHistoryQueries);
  }

  save(h);
}

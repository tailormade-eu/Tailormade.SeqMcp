import { loadPrefs } from "./prefs.js";

export type FormatMode = "compact" | "table" | "detail" | "raw";

interface SeqEvent {
  Id?: string;
  Timestamp?: string;
  Level?: string;
  RenderedMessage?: string;
  MessageTemplateTokens?: { Text?: string; PropertyName?: string; FormattedValue?: string }[];
  Exception?: string;
  Properties?: Record<string, unknown> | { Name: string; Value: unknown }[];
}

function props(e: SeqEvent): Record<string, unknown> {
  const p = e.Properties;
  if (!p) return {};
  if (Array.isArray(p)) {
    const obj: Record<string, unknown> = {};
    for (const { Name, Value } of p) obj[Name] = Value;
    return obj;
  }
  return p;
}

function ts(raw?: string): string {
  if (!raw) return "??:??:??";
  const d = new Date(raw);
  return d.toISOString().slice(11, 19);
}

function tsLong(raw?: string): string {
  if (!raw) return "unknown";
  return raw.replace("T", " ").replace(/\.\d+Z?$/, " UTC");
}

function lvl(raw?: string): string {
  if (!raw) return "???";
  const map: Record<string, string> = {
    Error: "ERR", Fatal: "FTL", Warning: "WRN",
    Information: "INF", Debug: "DBG", Verbose: "VRB",
  };
  return map[raw] ?? raw.slice(0, 3).toUpperCase();
}

function system(e: SeqEvent): string {
  const p = props(e);
  return String(p.System ?? p.ApplicationName ?? p.Application ?? "");
}

function reqPath(e: SeqEvent): string {
  return String(props(e).RequestPath ?? "");
}

function renderTokens(tokens: SeqEvent["MessageTemplateTokens"], p: Record<string, unknown>): string {
  if (!tokens) return "";
  return tokens.map((t) => {
    if (t.Text != null) return t.Text;
    if (t.PropertyName) {
      if (t.FormattedValue != null) return t.FormattedValue;
      const val = p[t.PropertyName];
      return val == null ? "" : String(val);
    }
    return "";
  }).join("");
}

function message(e: SeqEvent, maxLen: number): string {
  let msg = e.RenderedMessage ?? "";
  if (!msg && e.MessageTemplateTokens) {
    msg = renderTokens(e.MessageTemplateTokens, props(e));
  }
  msg = msg.replace(/\r?\n/g, " ").trim();
  if (maxLen > 0 && msg.length > maxLen) msg = msg.slice(0, maxLen) + "...";
  return msg;
}

function exceptionHead(e: SeqEvent, lines = 3): string {
  if (!e.Exception) return "";
  return e.Exception.split(/\r?\n/).slice(0, lines).join("\n");
}

function formatCompact(events: SeqEvent[], maxLen: number): string {
  if (events.length === 0) return "No events.";
  const first = ts(events[events.length - 1]?.Timestamp);
  const last = ts(events[0]?.Timestamp);
  const lines: string[] = [`${events.length} events | ${first} - ${last}`, ""];

  for (const e of events) {
    const sys = system(e);
    const path = reqPath(e);
    const parts = [ts(e.Timestamp), lvl(e.Level)];
    if (sys) parts.push(sys);
    if (path) parts.push(path);
    lines.push(parts.join(" "));

    const msg = message(e, maxLen);
    if (msg) lines.push(`  ${msg}`);

    const exc = exceptionHead(e);
    if (exc) lines.push(`  ${exc.split("\n").join("\n  ")}`);

    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatTable(events: SeqEvent[], maxLen: number): string {
  if (events.length === 0) return "No events.";
  const rows = events.map((e) => ({
    time: ts(e.Timestamp),
    level: lvl(e.Level),
    sys: system(e),
    path: reqPath(e),
    msg: message(e, maxLen),
  }));

  const w = {
    time: 8,
    level: 5,
    sys: Math.max(6, ...rows.map((r) => r.sys.length)),
    path: Math.max(4, ...rows.map((r) => r.path.length)),
  };

  const hdr = [
    "Time".padEnd(w.time),
    "Level".padEnd(w.level),
    "System".padEnd(w.sys),
    "Path".padEnd(w.path),
    "Message",
  ].join(" | ");

  const sep = [w.time, w.level, w.sys, w.path, 7].map((n) => "-".repeat(n)).join("-|-");

  const body = rows.map((r) =>
    [
      r.time.padEnd(w.time),
      r.level.padEnd(w.level),
      r.sys.padEnd(w.sys),
      r.path.padEnd(w.path),
      r.msg,
    ].join(" | ")
  );

  return [hdr, sep, ...body].join("\n");
}

function formatDetail(event: SeqEvent, hide: Set<string>): string {
  const lines: string[] = [];

  lines.push(`Event: ${event.Id ?? "unknown"}`);
  lines.push(`Time:  ${tsLong(event.Timestamp)}`);
  lines.push(`Level: ${event.Level ?? "unknown"}`);
  const sys = system(event);
  if (sys) lines.push(`System: ${sys}`);

  lines.push("");
  lines.push("Message:");
  lines.push(`  ${message(event, 0)}`);

  if (event.Exception) {
    lines.push("");
    lines.push("Exception:");
    lines.push(`  ${event.Exception.split(/\r?\n/).join("\n  ")}`);
  }

  const p = props(event);
  const shown = Object.entries(p).filter(([k]) => !hide.has(k));
  if (shown.length > 0) {
    lines.push("");
    lines.push("Properties:");
    for (const [k, v] of shown) {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      lines.push(`  ${k}: ${val}`);
    }
  }

  return lines.join("\n");
}

export function formatEvents(events: unknown[], mode: FormatMode): string {
  const prefs = loadPrefs();
  const maxLen = mode === "detail" ? 0 : prefs.maxMessageLength;
  const typed = events as SeqEvent[];

  switch (mode) {
    case "raw":
      return JSON.stringify(events, null, 2);
    case "compact":
      return formatCompact(typed, maxLen);
    case "table":
      return formatTable(typed, maxLen);
    case "detail": {
      const hide = new Set(prefs.hideFields);
      if (typed.length === 1) return formatDetail(typed[0], hide);
      return typed.map((e) => formatDetail(e, hide)).join("\n\n---\n\n");
    }
    default:
      throw new Error(`Unknown format mode: ${mode}`);
  }
}

export function formatSignals(signals: unknown[], mode: FormatMode): string {
  if (mode === "raw") return JSON.stringify(signals, null, 2);

  type Sig = { Id?: string; Title?: string; Description?: string; Filters?: { Filter?: string }[] };
  const typed = signals as Sig[];

  if (typed.length === 0) return "No signals.";

  if (mode === "detail") {
    return typed.map((s) => {
      const lines = [`Signal: ${s.Id ?? "?"}`, `Title:  ${s.Title ?? ""}`];
      if (s.Description) lines.push(`Desc:   ${s.Description}`);
      const filters = s.Filters?.map((f) => f.Filter).filter(Boolean) ?? [];
      if (filters.length) lines.push(`Filter: ${filters.join(" | ")}`);
      return lines.join("\n");
    }).join("\n\n");
  }

  // table or compact → table
  const rows = typed.map((s) => ({
    id: s.Id ?? "?",
    title: s.Title ?? "",
    filter: s.Filters?.map((f) => f.Filter).filter(Boolean).join(" | ") ?? "",
  }));

  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    title: Math.max(5, ...rows.map((r) => r.title.length)),
  };

  const hdr = ["ID".padEnd(w.id), "Title".padEnd(w.title), "Filter"].join(" | ");
  const sep = [w.id, w.title, 6].map((n) => "-".repeat(n)).join("-|-");
  const body = rows.map((r) =>
    [r.id.padEnd(w.id), r.title.padEnd(w.title), r.filter].join(" | ")
  );

  return [hdr, sep, ...body].join("\n");
}

export interface SeqClientOptions {
  serverUrl: string;
  apiKey: string;
}

export interface QueryResult {
  Columns?: string[];
  Rows?: unknown[][];
  Error?: string;
  Reasons?: string[];
  Suggestion?: string;
}

export interface ExpressionIndex {
  Id: string;
  Expression: string;
  Description?: string;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class SeqClient {
  private baseUrl: string;
  private apiKey: string;
  private signalsCache: CacheEntry<unknown[]> | null = null;
  private indexesCache: CacheEntry<ExpressionIndex[]> | null = null;
  private fieldValuesCache = new Map<string, CacheEntry<{ fields: Record<string, Set<string>>; sampleCount: number }>>();
  private CACHE_TTL = 10 * 60 * 1000;

  constructor(opts: SeqClientOptions) {
    this.baseUrl = opts.serverUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
  }

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "undefined") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { "X-Seq-ApiKey": this.apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Seq API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // Note: 400 responses are returned as success for /api/data (query endpoint) —
  // the response body contains structured error info (Error, Suggestion fields).
  // This is intentional and expected only for query endpoints.
  private async post<T>(path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "undefined") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "X-Seq-ApiKey": this.apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // For /api/data, 400 responses contain structured error info — return as-is
      if (res.status === 400) {
        try { return await res.json() as T; } catch { /* fall through */ }
      }
      const text = await res.text();
      throw new Error(`Seq API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async requestNdjson(path: string, params: Record<string, string> = {}): Promise<unknown[]> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== "undefined") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { "X-Seq-ApiKey": this.apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Seq API ${res.status}: ${body}`);
    }
    const text = await res.text();
    if (!text.trim()) return [];
    const lines = text.trim().split("\n");
    const parsed: unknown[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        parsed.push(JSON.parse(line));
      } catch {
        console.error(`[seq-mcp] Failed to parse NDJSON line: ${line.slice(0, 100)}`);
      }
    }
    return parsed;
  }

  async search(opts: {
    filter?: string;
    signal?: string;
    count?: number;
    startedAt?: string;
    endedAt?: string;
  }): Promise<unknown[]> {
    if (opts.count === 0) return [];
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count != null && opts.count > 0) params.count = String(opts.count);
    if (opts.startedAt) params.fromDateUtc = opts.startedAt;
    if (opts.endedAt) params.toDateUtc = opts.endedAt;
    const data = await this.request<unknown>("/api/events", params);
    if (!Array.isArray(data)) throw new Error(`Seq API returned unexpected response type: ${typeof data}`);
    return data as unknown[];
  }

  async getEvent(eventId: string): Promise<unknown> {
    return this.request<unknown>(`/api/events/${eventId}`, { render: "true" });
  }

  async listSignals(): Promise<unknown[]> {
    const now = Date.now();
    if (this.signalsCache && now - this.signalsCache.fetchedAt < this.CACHE_TTL) {
      return this.signalsCache.data;
    }
    const data = await this.request<unknown[]>("/api/signals", { shared: "true" });
    this.signalsCache = { data, fetchedAt: now };
    return data;
  }

  async recent(opts: {
    filter?: string;
    signal?: string;
    count?: number;
    afterId?: string;
  }): Promise<unknown[]> {
    if (opts.count === 0) return [];
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count != null && opts.count > 0) params.count = String(opts.count);
    if (opts.afterId) params.afterId = opts.afterId;
    const data = await this.request<unknown>("/api/events", params);
    if (!Array.isArray(data)) throw new Error(`Seq API returned unexpected response type: ${typeof data}`);
    return data as unknown[];
  }

  async scan(opts: {
    filter?: string;
    signal?: string;
    count?: number;
    afterId?: string;
    wait?: number;
  }): Promise<unknown[]> {
    if (opts.count === 0) return [];
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count != null && opts.count > 0) params.count = String(opts.count);
    if (opts.afterId) params.afterId = opts.afterId;
    params.wait = String(opts.wait ?? 5000);
    return this.requestNdjson("/api/events/scan", params);
  }

  async query(opts: {
    q: string;
    rangeStartUtc?: string;
    rangeEndUtc?: string;
    signal?: string;
    timeout?: number;
  }): Promise<QueryResult> {
    const params: Record<string, string> = { q: opts.q };
    if (opts.rangeStartUtc) params.rangeStartUtc = opts.rangeStartUtc;
    if (opts.rangeEndUtc) params.rangeEndUtc = opts.rangeEndUtc;
    if (opts.signal) params.signal = opts.signal;
    if (opts.timeout) params.timeoutMS = String(opts.timeout);
    return this.post<QueryResult>("/api/data", params, {});
  }

  async listExpressionIndexes(): Promise<ExpressionIndex[]> {
    const now = Date.now();
    if (this.indexesCache && now - this.indexesCache.fetchedAt < this.CACHE_TTL) {
      return this.indexesCache.data;
    }
    const data = await this.request<ExpressionIndex[]>("/api/expressionindexes", {});
    this.indexesCache = { data, fetchedAt: now };
    return data;
  }

  async discoverFields(filter: string, sampleSize = 20): Promise<{ fields: Record<string, Set<string>>; sampleCount: number }> {
    const now = Date.now();
    const cacheKey = `${filter.trim()}:${sampleSize}`;
    const cached = this.fieldValuesCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < this.CACHE_TTL) return cached.data;

    const events = await this.search({ filter, count: sampleSize });
    const fields: Record<string, Set<string>> = {};

    for (const raw of events) {
      const e = raw as { Properties?: Record<string, unknown> | { Name: string; Value: unknown }[] };
      let props: Record<string, unknown> = {};
      if (Array.isArray(e.Properties)) {
        for (const { Name, Value } of e.Properties) props[Name] = Value;
      } else if (e.Properties) {
        props = e.Properties;
      }
      for (const [k, v] of Object.entries(props)) {
        if (!fields[k]) fields[k] = new Set();
        const val = v == null ? "" : String(v);
        if (val && fields[k].size < 20) fields[k].add(val);
      }
    }

    const result = { fields, sampleCount: events.length };
    if (this.fieldValuesCache.size >= 50) this.fieldValuesCache.clear();
    this.fieldValuesCache.set(cacheKey, { data: result, fetchedAt: now });
    return result;
  }
}

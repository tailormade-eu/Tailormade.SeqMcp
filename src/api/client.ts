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
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Seq API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    url.searchParams.set("apiKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Seq API ${res.status}: ${body}`);
    }
    const text = await res.text();
    if (!text.trim()) return [];
    return text.trim().split("\n").map((line) => JSON.parse(line));
  }

  async search(opts: {
    filter?: string;
    signal?: string;
    count?: number;
    startedAt?: string;
    endedAt?: string;
  }): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count) params.count = String(opts.count);
    if (opts.startedAt) params.fromDateUtc = opts.startedAt;
    if (opts.endedAt) params.toDateUtc = opts.endedAt;
    return this.request<unknown[]>("/api/events", params);
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
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count) params.count = String(opts.count ?? 10);
    if (opts.afterId) params.afterId = opts.afterId;
    return this.request<unknown[]>("/api/events", params);
  }

  async scan(opts: {
    filter?: string;
    signal?: string;
    count?: number;
    afterId?: string;
    wait?: number;
  }): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (opts.filter) params.filter = opts.filter;
    if (opts.signal) params.signal = opts.signal;
    if (opts.count) params.count = String(opts.count ?? 10);
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
    const cacheKey = filter;
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
    this.fieldValuesCache.set(cacheKey, { data: result, fetchedAt: now });
    return result;
  }
}

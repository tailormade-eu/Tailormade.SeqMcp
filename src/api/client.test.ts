import { describe, it, expect, vi, beforeEach } from "vitest";
import { SeqClient } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function emptyResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("No body")),
    text: () => Promise.resolve(""),
  };
}

function ndjsonResponse(lines: string[], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(lines.join("\n")),
  };
}

let client: SeqClient;

beforeEach(() => {
  mockFetch.mockReset();
  client = new SeqClient({ serverUrl: "http://localhost:5341", apiKey: "test-key" });
});

describe("discoverFields", () => {
  it("normalizes Properties as [{Name,Value}] array", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      {
        Properties: [
          { Name: "System", Value: "App1" },
          { Name: "Env", Value: "prod" },
        ],
      },
    ]));

    const result = await client.discoverFields("System = 'App1'", 5);
    expect(result.fields).toHaveProperty("System");
    expect(result.fields).toHaveProperty("Env");
    expect(result.fields["System"].has("App1")).toBe(true);
    expect(result.fields["Env"].has("prod")).toBe(true);
    expect(result.sampleCount).toBe(1);
  });

  it("normalizes Properties as {key:value} object", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      {
        Properties: { System: "App2", RequestPath: "/api" },
      },
    ]));

    const result = await client.discoverFields("System = 'App2'", 5);
    expect(result.fields).toHaveProperty("System");
    expect(result.fields).toHaveProperty("RequestPath");
    expect(result.fields["System"].has("App2")).toBe(true);
  });

  it("handles events without Properties", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { Id: "event-1", Timestamp: "2026-01-01T00:00:00Z" },
    ]));

    const result = await client.discoverFields("filter", 5);
    expect(result.sampleCount).toBe(1);
    expect(Object.keys(result.fields).length).toBe(0);
  });
});

describe("cache key", () => {
  it("sampleSize=5 and sampleSize=20 are separate cache entries", async () => {
    // First call: sampleSize=5
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { Properties: { System: "Small" } },
    ]));
    const r1 = await client.discoverFields("filter", 5);

    // Second call: sampleSize=20 — should NOT use cache
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { Properties: { System: "Big" } },
    ]));
    const r2 = await client.discoverFields("filter", 20);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(r1.fields["System"].has("Small")).toBe(true);
    expect(r2.fields["System"].has("Big")).toBe(true);
  });

  it("same filter+sampleSize uses cache", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { Properties: { System: "Cached" } },
    ]));

    await client.discoverFields("same-filter", 10);
    const r2 = await client.discoverFields("same-filter", 10);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(r2.fields["System"].has("Cached")).toBe(true);
  });
});

describe("API key header", () => {
  it("sends X-Seq-ApiKey on requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    await client.search({});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { "X-Seq-ApiKey": "test-key" },
      }),
    );
  });
});

describe("error handling", () => {
  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(client.search({})).rejects.toThrow("Seq API 500");
  });
});

describe("count=0 early return", () => {
  it("search with count=0 returns empty array without calling fetch", async () => {
    const result = await client.search({ count: 0 });
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("recent with count=0 returns empty array without calling fetch", async () => {
    const result = await client.recent({ count: 0 });
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("scan with count=0 returns empty array without calling fetch", async () => {
    const result = await client.scan({ count: 0 });
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("scan (NDJSON)", () => {
  it("parses valid NDJSON lines", async () => {
    mockFetch.mockResolvedValueOnce(ndjsonResponse([
      JSON.stringify({ Id: "event-1" }),
      JSON.stringify({ Id: "event-2" }),
    ]));
    const result = await client.scan({});
    expect(result).toHaveLength(2);
    expect((result[0] as { Id: string }).Id).toBe("event-1");
  });

  it("partial-fail: skips invalid line, keeps valid ones", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce(ndjsonResponse([
      JSON.stringify({ Id: "event-1" }),
      "NOT VALID JSON",
      JSON.stringify({ Id: "event-3" }),
    ]));
    const result = await client.scan({});
    expect(result).toHaveLength(2);
    expect((result[0] as { Id: string }).Id).toBe("event-1");
    expect((result[1] as { Id: string }).Id).toBe("event-3");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("empty response returns empty array", async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse(200));
    const result = await client.scan({});
    expect(result).toEqual([]);
  });

  it("whitespace-only lines are skipped", async () => {
    mockFetch.mockResolvedValueOnce(ndjsonResponse([
      "  ",
      JSON.stringify({ Id: "event-1" }),
      "   ",
    ]));
    // whitespace-only lines will fail JSON.parse but that's the current behavior
    // The important thing is valid lines are still parsed
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await client.scan({});
    expect(result).toHaveLength(1);
    expect((result[0] as { Id: string }).Id).toBe("event-1");
    spy.mockRestore();
  });

  it("throws on non-OK NDJSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: () => Promise.resolve("Bad Gateway"),
    });
    await expect(client.scan({})).rejects.toThrow("Seq API 502");
  });
});

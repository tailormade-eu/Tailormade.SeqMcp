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

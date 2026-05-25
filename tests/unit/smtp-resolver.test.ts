import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns/promises";
import { resolveMX } from "../../src/services/smtp/resolver.js";
import { MxHost } from "../../src/services/smtp/types.js";

vi.mock("node:dns/promises", () => ({
  default: {
    resolveMx: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

const mockResolveMx = dns.resolveMx as ReturnType<typeof vi.fn>;
const mockResolve4 = dns.resolve4 as ReturnType<typeof vi.fn>;
const mockResolve6 = dns.resolve6 as ReturnType<typeof vi.fn>;

function dnsError(code: string): Error {
  const err = new Error(`queryMx ${code}`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveMX", () => {
  it("returns MX records sorted by priority", async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: "mx2.example.com", priority: 20 },
      { exchange: "mx1.example.com", priority: 10 },
      { exchange: "mx3.example.com", priority: 30 },
    ]);

    const result = await resolveMX("example.com");

    expect(result).toHaveLength(3);
    expect(result[0].host).toBe("mx1.example.com");
    expect(result[0].priority).toBe(10);
    expect(result[1].host).toBe("mx2.example.com");
    expect(result[1].priority).toBe(20);
    expect(result[2].host).toBe("mx3.example.com");
    expect(result[2].priority).toBe(30);
    expect(result[0].isFallback).toBe(false);
  });

  it("sets port 25 for all records", async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: "mx.example.com", priority: 10 },
    ]);

    const result = await resolveMX("example.com");
    expect(result[0].port).toBe(25);
  });

  it("falls back to A record when no MX (ENODATA)", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ENODATA"));
    mockResolve4.mockResolvedValue(["93.184.216.34"]);

    const result = await resolveMX("example.com");

    expect(result).toHaveLength(1);
    expect(result[0].host).toBe("93.184.216.34");
    expect(result[0].isFallback).toBe(true);
    expect(result[0].port).toBe(25);
    expect(result[0].priority).toBe(10);
  });

  it("falls back to A record when MX returns empty array", async () => {
    mockResolveMx.mockResolvedValue([]);
    mockResolve4.mockResolvedValue(["1.2.3.4"]);

    const result = await resolveMX("example.com");

    expect(result).toHaveLength(1);
    expect(result[0].host).toBe("1.2.3.4");
    expect(result[0].isFallback).toBe(true);
  });

  it("falls back to AAAA when no MX and no A", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ENODATA"));
    mockResolve4.mockRejectedValue(dnsError("ENODATA"));
    mockResolve6.mockResolvedValue(["2001:db8::1"]);

    const result = await resolveMX("example.com");

    expect(result).toHaveLength(1);
    expect(result[0].host).toBe("2001:db8::1");
    expect(result[0].isFallback).toBe(true);
  });

  it("returns empty array for ENOTFOUND", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ENOTFOUND"));

    const result = await resolveMX("nonexistent.invalid");
    expect(result).toEqual([]);
  });

  it("returns empty array for ECONNREFUSED", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ECONNREFUSED"));

    const result = await resolveMX("unreachable.test");
    expect(result).toEqual([]);
  });

  it("throws on SERVFAIL", async () => {
    mockResolveMx.mockRejectedValue(dnsError("SERVFAIL"));

    await expect(resolveMX("broken.example.com")).rejects.toThrow(
      "DNS server failure for broken.example.com",
    );
  });

  it("throws on ETIMEOUT", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ETIMEOUT"));

    await expect(resolveMX("slow.example.com")).rejects.toThrow(
      "DNS timeout for slow.example.com",
    );
  });

  it("uses cache on second call", async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: "mx.example.com", priority: 10 },
    ]);

    const cache = new Map<string, MxHost[]>();

    const first = await resolveMX("example.com", cache);
    const second = await resolveMX("example.com", cache);

    expect(first).toEqual(second);
    expect(mockResolveMx).toHaveBeenCalledTimes(1);
  });

  it("returns empty when no MX, no A, no AAAA", async () => {
    mockResolveMx.mockRejectedValue(dnsError("ENODATA"));
    mockResolve4.mockRejectedValue(dnsError("ENODATA"));
    mockResolve6.mockRejectedValue(dnsError("ENODATA"));

    const result = await resolveMX("no-records.example.com");
    expect(result).toEqual([]);
  });
});

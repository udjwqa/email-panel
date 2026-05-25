import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProxyRotator } from "../../src/services/proxy/rotation.js";

const mockFindMany = vi.fn();
const mockPrisma = {
  proxy: {
    findMany: mockFindMany,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProxyRotator", () => {
  it("loads active proxies from database", async () => {
    mockFindMany.mockResolvedValue([
      { host: "proxy1.com", port: 8080, protocol: "HTTP" },
      { host: "proxy2.com", port: 8080, protocol: "HTTP" },
    ]);

    const rotator = new ProxyRotator(mockPrisma as any);
    await rotator.loadActiveProxies();

    expect(rotator.getCount()).toBe(2);
  });

  it("returns next proxy in round-robin", async () => {
    mockFindMany.mockResolvedValue([
      { host: "proxy1.com", port: 8080, protocol: "HTTP" },
      { host: "proxy2.com", port: 8080, protocol: "HTTP" },
    ]);

    const rotator = new ProxyRotator(mockPrisma as any);
    await rotator.loadActiveProxies();

    const first = rotator.getNext();
    const second = rotator.getNext();
    const third = rotator.getNext();

    expect(first?.host).toBe("proxy1.com");
    expect(second?.host).toBe("proxy2.com");
    expect(third?.host).toBe("proxy1.com");
  });

  it("returns random proxy", async () => {
    mockFindMany.mockResolvedValue([
      { host: "proxy1.com", port: 8080, protocol: "HTTP" },
      { host: "proxy2.com", port: 8080, protocol: "HTTP" },
    ]);

    const rotator = new ProxyRotator(mockPrisma as any);
    await rotator.loadActiveProxies();

    const proxy = rotator.getRandom();
    expect(proxy).toBeDefined();
    expect(["proxy1.com", "proxy2.com"]).toContain(proxy?.host);
  });

  it("returns null when no proxies available", () => {
    const rotator = new ProxyRotator(mockPrisma as any);
    expect(rotator.getNext()).toBeNull();
    expect(rotator.getRandom()).toBeNull();
  });
});

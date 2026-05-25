import { describe, it, expect, vi } from "vitest";
import { validateEmail, createDnsCache } from "../../src/services/validators/index.js";

vi.mock("node:dns/promises", () => ({
  default: {
    resolve: vi.fn(async (domain: string) => {
      if (domain === "gmail.com" || domain === "example.com") return ["1.2.3.4"];
      throw new Error("ENOTFOUND");
    }),
    resolveMx: vi.fn(async (domain: string) => {
      if (domain === "gmail.com") return [{ exchange: "mx.gmail.com", priority: 10 }];
      if (domain === "example.com") return [];
      throw new Error("ENOTFOUND");
    }),
  },
}));

describe("validateEmail pipeline", () => {
  it("returns INVALID_FORMAT for bad email", async () => {
    const cache = createDnsCache();
    const result = await validateEmail("not-valid", "example.com", cache);
    expect(result.status).toBe("INVALID_FORMAT");
    expect(result.errorReason).toBeTruthy();
  });

  it("returns DOMAIN_NOT_FOUND for non-existent domain", async () => {
    const cache = createDnsCache();
    const result = await validateEmail("user@nonexistent.xyz", "nonexistent.xyz", cache);
    expect(result.status).toBe("DOMAIN_NOT_FOUND");
  });

  it("returns MX_NOT_FOUND for domain without MX", async () => {
    const cache = createDnsCache();
    const result = await validateEmail("user@example.com", "example.com", cache);
    expect(result.status).toBe("MX_NOT_FOUND");
  });

  it("returns MX_FOUND for valid email with MX", async () => {
    const cache = createDnsCache();
    const result = await validateEmail("user@gmail.com", "gmail.com", cache);
    expect(result.status).toBe("MX_FOUND");
    expect(result.mxFound).toBe(true);
    expect(result.domainGroup).toBe("Google");
  });

  it("uses DNS cache for repeated lookups", async () => {
    const cache = createDnsCache();
    await validateEmail("a@gmail.com", "gmail.com", cache);
    await validateEmail("b@gmail.com", "gmail.com", cache);
    expect(cache.domain.get("gmail.com")).toBe(true);
    expect(cache.mx.get("gmail.com")).toBe(true);
  });

  it("sets domainGroup correctly", async () => {
    const cache = createDnsCache();
    const result = await validateEmail("user@gmail.com", "gmail.com", cache);
    expect(result.domainGroup).toBe("Google");
  });
});

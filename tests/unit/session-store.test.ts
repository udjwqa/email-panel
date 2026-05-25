import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../../src/services/http/session-store.js";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe("setCookie", () => {
    it("sets a simple cookie", async () => {
      await store.setCookie("example.com", "session=abc123; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain("session=abc123");
    });

    it("sets multiple cookies for the same domain", async () => {
      await store.setCookie("example.com", "session=abc123; Path=/");
      await store.setCookie("example.com", "token=xyz789; Path=/");

      const cookies = await store.getCookies("example.com");
      expect(cookies.length).toBeGreaterThanOrEqual(2);
    });

    it("handles cookie with expiration", async () => {
      const expires = new Date(Date.now() + 3600000).toUTCString();
      await store.setCookie(
        "example.com",
        `auth=token; Expires=${expires}; Path=/`,
      );

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
    });

    it("handles cookie with Max-Age", async () => {
      await store.setCookie(
        "example.com",
        "session=value; Max-Age=3600; Path=/",
      );

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
    });

    it("handles cookie with Domain attribute", async () => {
      await store.setCookie(
        "example.com",
        "cross=domain; Domain=.example.com; Path=/",
      );

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
    });

    it("handles HttpOnly cookie", async () => {
      await store.setCookie("example.com", "secure=data; HttpOnly; Path=/");

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain("secure=data");
    });

    it("handles Secure cookie", async () => {
      await store.setCookie("example.com", "secure=data; Secure; Path=/");

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain("secure=data");
    });

    it("normalizes domain names", async () => {
      await store.setCookie("Example.COM", "test=value; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("handles domain with protocol", async () => {
      await store.setCookie("https://example.com", "test=value; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("throws error on invalid cookie string", async () => {
      await expect(
        store.setCookie("example.com", "invalid cookie format"),
      ).rejects.toThrow();
    });
  });

  describe("getCookies", () => {
    it("returns empty array for unknown domain", async () => {
      const cookies = await store.getCookies("unknown.com");
      expect(cookies).toEqual([]);
    });

    it("returns all cookies for a domain", async () => {
      await store.setCookie("example.com", "a=1; Path=/");
      await store.setCookie("example.com", "b=2; Path=/");
      await store.setCookie("example.com", "c=3; Path=/");

      const cookies = await store.getCookies("example.com");
      expect(cookies.length).toBeGreaterThanOrEqual(3);
    });

    it("does not return cookies from other domains", async () => {
      await store.setCookie("example.com", "session=abc; Path=/");
      await store.setCookie("other.com", "token=xyz; Path=/");

      const cookies = await store.getCookies("example.com");
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain("session=abc");
    });
  });

  describe("getHeaders", () => {
    it("returns Cookie header for domain with cookies", async () => {
      await store.setCookie("example.com", "session=abc123; Path=/");
      const headers = await store.getHeaders("example.com");

      expect(headers).toHaveProperty("Cookie");
      expect(headers.Cookie).toContain("session=abc123");
    });

    it("returns empty object for domain without cookies", async () => {
      const headers = await store.getHeaders("unknown.com");
      expect(headers).toEqual({});
    });

    it("combines multiple cookies in Cookie header", async () => {
      await store.setCookie("example.com", "a=1; Path=/");
      await store.setCookie("example.com", "b=2; Path=/");

      const headers = await store.getHeaders("example.com");
      expect(headers.Cookie).toContain("a=1");
      expect(headers.Cookie).toContain("b=2");
    });
  });

  describe("updateFromResponse", () => {
    it("updates cookies from Set-Cookie header", async () => {
      const headers = {
        "set-cookie": "session=newvalue; Path=/",
      };

      await store.updateFromResponse("example.com", headers);
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain("session=newvalue");
    });

    it("handles multiple Set-Cookie headers", async () => {
      const headers = {
        "set-cookie": ["session=abc; Path=/", "token=xyz; Path=/"],
      };

      await store.updateFromResponse("example.com", headers);
      const cookies = await store.getCookies("example.com");

      expect(cookies.length).toBeGreaterThanOrEqual(2);
    });

    it("handles case-insensitive Set-Cookie header", async () => {
      const headers = {
        "Set-Cookie": "session=value; Path=/",
      };

      await store.updateFromResponse("example.com", headers);
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("does nothing when no Set-Cookie header", async () => {
      const headers = {
        "content-type": "application/json",
      };

      await store.updateFromResponse("example.com", headers);
      const cookies = await store.getCookies("example.com");

      expect(cookies).toEqual([]);
    });

    it("updates existing cookies", async () => {
      await store.setCookie("example.com", "session=old; Path=/");

      const headers = {
        "set-cookie": "session=new; Path=/",
      };

      await store.updateFromResponse("example.com", headers);
      const cookies = await store.getCookies("example.com");

      expect(cookies[0]).toContain("session=new");
    });
  });

  describe("clearSession", () => {
    it("clears session for specific domain", async () => {
      await store.setCookie("example.com", "session=abc; Path=/");
      await store.setCookie("other.com", "token=xyz; Path=/");

      await store.clearSession("example.com");

      const exampleCookies = await store.getCookies("example.com");
      const otherCookies = await store.getCookies("other.com");

      expect(exampleCookies).toEqual([]);
      expect(otherCookies).toHaveLength(1);
    });

    it("does nothing for non-existent domain", async () => {
      await expect(store.clearSession("unknown.com")).resolves.not.toThrow();
    });
  });

  describe("clearAll", () => {
    it("clears all sessions", async () => {
      await store.setCookie("example.com", "session=abc; Path=/");
      await store.setCookie("other.com", "token=xyz; Path=/");
      await store.setCookie("third.com", "data=123; Path=/");

      await store.clearAll();

      const stats = store.getStats();
      expect(stats.totalSessions).toBe(0);
      expect(stats.domains).toEqual([]);
    });
  });

  describe("getSessionData", () => {
    it("returns session data for domain", async () => {
      await store.setCookie("example.com", "session=abc; Path=/");

      const data = await store.getSessionData("example.com");

      expect(data).not.toBeNull();
      expect(data?.domain).toBe("example.com");
      expect(data?.cookies).toHaveLength(1);
    });

    it("returns null for unknown domain", async () => {
      const data = await store.getSessionData("unknown.com");
      expect(data).toBeNull();
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", async () => {
      await store.setCookie("example.com", "a=1; Path=/");
      await store.setCookie("other.com", "b=2; Path=/");

      const stats = store.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.domains).toContain("example.com");
      expect(stats.domains).toContain("other.com");
    });

    it("returns empty stats for new store", () => {
      const stats = store.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.domains).toEqual([]);
    });
  });

  describe("domain normalization", () => {
    it("normalizes uppercase domains", async () => {
      await store.setCookie("EXAMPLE.COM", "test=1; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("removes protocol from domain", async () => {
      await store.setCookie("https://example.com", "test=1; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("removes port from domain", async () => {
      await store.setCookie("example.com:8080", "test=1; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });

    it("removes path from domain", async () => {
      await store.setCookie("example.com/path/to/page", "test=1; Path=/");
      const cookies = await store.getCookies("example.com");

      expect(cookies).toHaveLength(1);
    });
  });
});

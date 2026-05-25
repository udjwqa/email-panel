import { describe, it, expect } from "vitest";
import {
  isRateLimited,
  extractRetryAfterDelay,
  calculateBackoffDelay,
  getRetryDelay,
} from "../../src/services/http/retry-utils.js";
import type { HttpResponse } from "../../src/services/http/types.js";

describe("HTTP Retry Utilities", () => {
  describe("isRateLimited", () => {
    it("detects 429 status code", () => {
      const response: HttpResponse = {
        status: 429,
        statusText: "Too Many Requests",
        headers: {},
        data: {},
        responseTime: 100,
      };

      expect(isRateLimited(response)).toBe(true);
    });

    it("detects Retry-After header", () => {
      const response: HttpResponse = {
        status: 200,
        statusText: "OK",
        headers: { "Retry-After": "30" },
        data: {},
        responseTime: 100,
      };

      expect(isRateLimited(response)).toBe(true);
    });

    it("detects X-RateLimit headers", () => {
      const response: HttpResponse = {
        status: 200,
        statusText: "OK",
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Limit": "100",
        },
        data: {},
        responseTime: 100,
      };

      expect(isRateLimited(response)).toBe(true);
    });

    it("returns false for 200 OK without rate limit signals", () => {
      const response: HttpResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { success: true },
        responseTime: 100,
      };

      expect(isRateLimited(response)).toBe(false);
    });

    it("returns false for 401 Unauthorized", () => {
      const response: HttpResponse = {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        data: { error: "invalid_credentials" },
        responseTime: 100,
      };

      expect(isRateLimited(response)).toBe(false);
    });
  });

  describe("extractRetryAfterDelay", () => {
    it("parses seconds format", () => {
      const headers = { "Retry-After": "30" };
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBe(30000);
    });

    it("parses HTTP-date format", () => {
      const futureDate = new Date(Date.now() + 60000); // 60 seconds from now
      const headers = { "Retry-After": futureDate.toUTCString() };
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBeGreaterThan(55000);
      expect(delay).toBeLessThan(65000);
    });

    it("returns null for missing header", () => {
      const headers = {};
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBeNull();
    });

    it("returns null for invalid format", () => {
      const headers = { "Retry-After": "invalid" };
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBeNull();
    });

    it("returns null for past HTTP-date", () => {
      const pastDate = new Date(Date.now() - 60000); // 60 seconds ago
      const headers = { "Retry-After": pastDate.toUTCString() };
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBeNull();
    });

    it("handles case-insensitive header names", () => {
      const headers = { "retry-after": "10" };
      const delay = extractRetryAfterDelay(headers);

      expect(delay).toBe(10000);
    });
  });

  describe("calculateBackoffDelay", () => {
    it("calculates delay for attempt 0 (~1000ms ±250ms)", () => {
      const delay = calculateBackoffDelay(0, 1000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });

    it("calculates delay for attempt 1 (~2000ms ±500ms)", () => {
      const delay = calculateBackoffDelay(1, 1000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    });

    it("calculates delay for attempt 2 (~4000ms ±1000ms)", () => {
      const delay = calculateBackoffDelay(2, 1000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it("calculates delay for attempt 3 (~8000ms ±2000ms)", () => {
      const delay = calculateBackoffDelay(3, 1000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(6000);
      expect(delay).toBeLessThanOrEqual(10000);
    });

    it("calculates delay for attempt 4 (~16000ms ±4000ms)", () => {
      const delay = calculateBackoffDelay(4, 1000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(12000);
      expect(delay).toBeLessThanOrEqual(20000);
    });

    it("respects custom base delay", () => {
      const delay = calculateBackoffDelay(0, 2000, 0.25);

      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    });

    it("respects custom jitter factor", () => {
      const delay = calculateBackoffDelay(0, 1000, 0.5); // ±50%

      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1500);
    });

    it("never returns negative delay", () => {
      // Even with large jitter, delay should be >= 0
      const delays = Array(100)
        .fill(0)
        .map(() => calculateBackoffDelay(0, 100, 0.99));

      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("getRetryDelay", () => {
    it("prefers Retry-After header over exponential backoff", () => {
      const response: HttpResponse = {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "10" },
        data: {},
        responseTime: 100,
      };

      const delay = getRetryDelay(response, 0, 1000, 0.25);

      // Should be ~10000ms ±2500ms (not ~1000ms from exponential)
      expect(delay).toBeGreaterThan(7000);
      expect(delay).toBeLessThan(13000);
    });

    it("adds jitter to Retry-After value", () => {
      const response: HttpResponse = {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "10" },
        data: {},
        responseTime: 100,
      };

      const delays = Array(20)
        .fill(0)
        .map(() => getRetryDelay(response, 0, 1000, 0.25));

      // Check variation in delays (jitter effect)
      const unique = new Set(delays);
      expect(unique.size).toBeGreaterThan(1);
    });

    it("falls back to exponential backoff when no Retry-After", () => {
      const response: HttpResponse = {
        status: 429,
        statusText: "Too Many Requests",
        headers: {},
        data: {},
        responseTime: 100,
      };

      const delay = getRetryDelay(response, 1, 1000, 0.25);

      // Attempt 1: ~2000ms ±500ms
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    });

    it("handles invalid Retry-After gracefully", () => {
      const response: HttpResponse = {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "invalid" },
        data: {},
        responseTime: 100,
      };

      const delay = getRetryDelay(response, 0, 1000, 0.25);

      // Should fall back to exponential backoff
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });
  });
});

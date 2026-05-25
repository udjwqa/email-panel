import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../../src/services/http/client.js";

// Mock axios request
const mockAxiosRequest = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      request: mockAxiosRequest,
    })),
  },
}));

describe("HttpClient Retry Logic", () => {
  beforeEach(() => {
    mockAxiosRequest.mockReset();
  });

  describe("Retries disabled (default)", () => {
    it("does not retry on 429 when retries disabled", async () => {
      const client = new HttpClient();

      mockAxiosRequest.mockResolvedValueOnce({
        status: 429,
        statusText: "Too Many Requests",
        headers: {},
        data: {},
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(429);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });

    it("returns response immediately without retry metadata", async () => {
      const client = new HttpClient();

      mockAxiosRequest.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: { success: true },
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("Basic retry on 429", () => {
    it("retries once on 429 and succeeds", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 5,
          baseDelay: 10, // Very short for testing
          jitterFactor: 0,
        },
      });

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: { success: true },
        });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.retryMetadata).toBeDefined();
      expect(response.retryMetadata?.attempts).toBe(1);
      expect(response.retryMetadata?.rateLimited).toBe(true);
      expect(mockAxiosRequest).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 200 OK", async () => {
      const client = new HttpClient({
        retryConfig: { enabled: true },
      });

      mockAxiosRequest.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: { success: true },
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("Exponential backoff verification", () => {
    it("makes 5 retry attempts on consecutive 429s", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 5,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      // Mock 6 consecutive 429 responses
      for (let i = 0; i < 6; i++) {
        mockAxiosRequest.mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        });
      }

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(429);
      expect(response.retryMetadata?.attempts).toBe(5);
      expect(mockAxiosRequest).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });

    it("tracks individual delay amounts", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 3,
          baseDelay: 100,
          jitterFactor: 0,
        },
      });

      // Mock 4 consecutive 429 responses
      for (let i = 0; i < 4; i++) {
        mockAxiosRequest.mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        });
      }

      const response = await client.get("https://api.example.com/test");

      expect(response.retryMetadata?.delays).toHaveLength(3);
      // Exponential: 100ms, 200ms, 400ms (no jitter)
      expect(response.retryMetadata?.delays[0]).toBe(100);
      expect(response.retryMetadata?.delays[1]).toBe(200);
      expect(response.retryMetadata?.delays[2]).toBe(400);
    });

    it("calculates total retry delay correctly", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 2,
          baseDelay: 100,
          jitterFactor: 0,
        },
      });

      // Mock 3 consecutive 429 responses
      for (let i = 0; i < 3; i++) {
        mockAxiosRequest.mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        });
      }

      const response = await client.get("https://api.example.com/test");

      // Total: 100ms + 200ms = 300ms
      expect(response.retryMetadata?.totalRetryDelay).toBe(300);
    });
  });

  describe("Max retries exhaustion", () => {
    it("stops after max retries and returns last 429", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 3,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      // Mock 10 consecutive 429 responses
      for (let i = 0; i < 10; i++) {
        mockAxiosRequest.mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        });
      }

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(429);
      expect(response.retryMetadata?.attempts).toBe(3);
      expect(mockAxiosRequest).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it("returns retry metadata on exhausted retries", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 2,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      for (let i = 0; i < 5; i++) {
        mockAxiosRequest.mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        });
      }

      const response = await client.get("https://api.example.com/test");

      expect(response.retryMetadata).toBeDefined();
      expect(response.retryMetadata?.attempts).toBe(2);
      expect(response.retryMetadata?.rateLimited).toBe(true);
    });
  });

  describe("Retry-After header handling", () => {
    it("uses Retry-After header delay", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          baseDelay: 100,
          jitterFactor: 0,
        },
      });

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: { "Retry-After": "0" }, // 0 seconds for fast test
          data: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: { success: true },
        });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.retryMetadata?.attempts).toBe(1);
      expect(mockAxiosRequest).toHaveBeenCalledTimes(2);
    });

    it("handles HTTP-date Retry-After format", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      const futureDate = new Date(Date.now() + 10); // Very short delay

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: { "Retry-After": futureDate.toUTCString() },
          data: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: { success: true },
        });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.retryMetadata?.attempts).toBe(1);
    });
  });

  describe("Non-rate-limited errors", () => {
    it("does not retry on 401 Unauthorized", async () => {
      const client = new HttpClient({
        retryConfig: { enabled: true },
      });

      mockAxiosRequest.mockResolvedValueOnce({
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        data: { error: "invalid_credentials" },
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(401);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });

    it("does not retry on 404 Not Found", async () => {
      const client = new HttpClient({
        retryConfig: { enabled: true },
      });

      mockAxiosRequest.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        headers: {},
        data: {},
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(404);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });

    it("does not retry on 500 Internal Server Error", async () => {
      const client = new HttpClient({
        retryConfig: { enabled: true },
      });

      mockAxiosRequest.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        data: {},
      });

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(500);
      expect(response.retryMetadata).toBeUndefined();
      expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("Jitter randomization", () => {
    it("applies jitter to delays", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 3,
          baseDelay: 1000,
          jitterFactor: 0.25, // ±25%
        },
      });

      // Run multiple times to collect delay distribution
      const allDelays: number[] = [];

      for (let run = 0; run < 10; run++) {
        vi.clearAllMocks();

        // Mock 2 consecutive 429s
        mockAxiosRequest
          .mockResolvedValueOnce({
            status: 429,
            statusText: "Too Many Requests",
            headers: {},
            data: {},
          })
          .mockResolvedValueOnce({
            status: 200,
            statusText: "OK",
            headers: {},
            data: { success: true },
          });

        const response = await client.get("https://api.example.com/test");
        if (response.retryMetadata) {
          allDelays.push(...response.retryMetadata.delays);
        }
      }

      // Check that delays vary (jitter effect)
      const uniqueDelays = new Set(allDelays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be in range 750-1250ms (1000ms ±25%)
      allDelays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(750);
        expect(delay).toBeLessThanOrEqual(1250);
      });
    });
  });

  describe("Different HTTP methods", () => {
    it("retries POST requests", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: { id: 123 },
        });

      const response = await client.post("https://api.example.com/data", {
        foo: "bar",
      });

      expect(response.status).toBe(200);
      expect(response.retryMetadata?.attempts).toBe(1);
    });

    it("retries PUT requests", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          statusText: "OK",
          headers: {},
          data: { updated: true },
        });

      const response = await client.put("https://api.example.com/data/123", {
        foo: "baz",
      });

      expect(response.status).toBe(200);
      expect(response.retryMetadata?.attempts).toBe(1);
    });

    it("retries DELETE requests", async () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          baseDelay: 10,
          jitterFactor: 0,
        },
      });

      mockAxiosRequest
        .mockResolvedValueOnce({
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          data: {},
        })
        .mockResolvedValueOnce({
          status: 204,
          statusText: "No Content",
          headers: {},
          data: null,
        });

      const response = await client.delete("https://api.example.com/data/123");

      expect(response.status).toBe(204);
      expect(response.retryMetadata?.attempts).toBe(1);
    });
  });
});

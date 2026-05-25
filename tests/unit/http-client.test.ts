import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../../src/services/http/client.js";
import type { ProxyEntry } from "../../src/services/proxy/types.js";

// Mock axios
const mockRequest = vi.fn();
const mockDefaults = { timeout: 15000 };

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      request: mockRequest,
      defaults: mockDefaults,
    })),
  },
}));

describe("HttpClient", () => {
  let client: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HttpClient();
  });

  describe("constructor", () => {
    it("creates instance with default config", () => {
      const defaultClient = new HttpClient();
      expect(defaultClient.getTimeout()).toBe(15000);
    });

    it("creates instance with custom timeout", () => {
      const customClient = new HttpClient({ timeout: 30000 });
      expect(customClient.getTimeout()).toBe(30000);
    });

    it("creates instance with custom headers", () => {
      const headers = { "X-Custom": "value" };
      const customClient = new HttpClient({ defaultHeaders: headers });
      expect(customClient).toBeDefined();
    });

    it("creates instance with custom max redirects", () => {
      const customClient = new HttpClient({ maxRedirects: 10 });
      expect(customClient).toBeDefined();
    });

    it("creates instance with custom user agent", () => {
      const customClient = new HttpClient({ userAgent: "CustomBot/1.0" });
      expect(customClient).toBeDefined();
    });
  });

  describe("setTimeout", () => {
    it("updates timeout value", () => {
      client.setTimeout(20000);
      expect(client.getTimeout()).toBe(20000);
    });

    it("updates axios instance timeout", () => {
      client.setTimeout(25000);
      expect(mockDefaults.timeout).toBe(25000);
    });
  });

  describe("request methods", () => {
    it("performs GET request", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        data: { success: true },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://api.example.com/test");

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
      expect(response.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "https://api.example.com/test",
        }),
      );
    });

    it("performs POST request with data", async () => {
      const mockResponse = {
        status: 201,
        statusText: "Created",
        headers: {},
        data: { id: 123 },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.post("https://api.example.com/create", {
        name: "test",
      });

      expect(response.status).toBe(201);
      expect(response.data).toEqual({ id: 123 });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: "https://api.example.com/create",
          data: { name: "test" },
        }),
      );
    });

    it("performs PUT request with data", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { id: 123, name: "updated" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.put("https://api.example.com/update/123", {
        name: "updated",
      });

      expect(response.status).toBe(200);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "PUT",
          url: "https://api.example.com/update/123",
        }),
      );
    });

    it("performs DELETE request", async () => {
      const mockResponse = {
        status: 204,
        statusText: "No Content",
        headers: {},
        data: null,
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.delete("https://api.example.com/delete/123");

      expect(response.status).toBe(204);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "DELETE",
          url: "https://api.example.com/delete/123",
        }),
      );
    });
  });

  describe("proxy support", () => {
    it("creates HTTP proxy agent", async () => {
      const proxy: ProxyEntry = {
        host: "proxy.example.com",
        port: 8080,
        protocol: "HTTP",
      };

      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { ip: "1.2.3.4" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://httpbin.org/ip", { proxy });

      expect(response.status).toBe(200);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          httpAgent: expect.anything(),
          httpsAgent: expect.anything(),
        }),
      );
    });

    it("creates SOCKS5 proxy agent with auth", async () => {
      const proxy: ProxyEntry = {
        host: "socks.example.com",
        port: 1080,
        protocol: "SOCKS5",
        username: "user",
        password: "pass",
      };

      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { ip: "5.6.7.8" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://httpbin.org/ip", { proxy });

      expect(response.status).toBe(200);
    });

    it("creates SOCKS4 proxy agent", async () => {
      const proxy: ProxyEntry = {
        host: "socks4.example.com",
        port: 1080,
        protocol: "SOCKS4",
      };

      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { ip: "9.10.11.12" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://httpbin.org/ip", { proxy });

      expect(response.status).toBe(200);
    });
  });

  describe("requestSafe", () => {
    it("returns success result on successful request", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { test: "data" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.requestSafe({
        url: "https://api.example.com/test",
        method: "GET",
      });

      expect(result.success).toBe(true);
      expect(result.response?.data).toEqual({ test: "data" });
      expect(result.error).toBeUndefined();
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("returns error result on failed request", async () => {
      mockRequest.mockRejectedValue(new Error("Network error"));

      const result = await client.requestSafe({
        url: "https://api.example.com/fail",
        method: "GET",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(result.response).toBeUndefined();
    });

    it("measures response time on error", async () => {
      mockRequest.mockRejectedValue(new Error("Timeout"));

      const result = await client.requestSafe({
        url: "https://api.example.com/timeout",
        method: "GET",
      });

      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("handles unknown error types", async () => {
      mockRequest.mockRejectedValue("String error");

      const result = await client.requestSafe({
        url: "https://api.example.com/error",
        method: "GET",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
    });
  });

  describe("error handling", () => {
    it("accepts all HTTP status codes", async () => {
      const mockResponse = {
        status: 404,
        statusText: "Not Found",
        headers: {},
        data: { error: "Not found" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://api.example.com/notfound");

      expect(response.status).toBe(404);
      expect(response.data).toEqual({ error: "Not found" });
    });

    it("accepts 5xx errors", async () => {
      const mockResponse = {
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        data: { error: "Server error" },
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://api.example.com/error");

      expect(response.status).toBe(500);
    });

    it("includes response headers", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "x-custom-header": "value",
        },
        data: {},
      };

      mockRequest.mockResolvedValue(mockResponse);

      const response = await client.get("https://api.example.com/test");

      expect(response.headers).toEqual({
        "content-type": "application/json",
        "x-custom-header": "value",
      });
    });
  });

  describe("custom options", () => {
    it("respects custom timeout in request", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
      };

      mockRequest.mockResolvedValue(mockResponse);

      await client.get("https://api.example.com/test", { timeout: 5000 });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        }),
      );
    });

    it("passes custom headers in request", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
      };

      mockRequest.mockResolvedValue(mockResponse);

      await client.get("https://api.example.com/test", {
        headers: { "X-Custom": "test" },
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "X-Custom": "test" },
        }),
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuthClient } from "../../src/services/oauth/client.js";
import { MockOAuthServer } from "../../src/services/oauth/mock-server.js";
import type { ProxyEntry } from "../../src/services/proxy/types.js";

// Mock HttpClient
const mockPost = vi.fn();

vi.mock("../../src/services/http/client.js", () => ({
  HttpClient: class {
    post = mockPost;
  },
}));

describe("OAuthClient", () => {
  let client: OAuthClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OAuthClient();
  });

  it("authenticates successfully with valid credentials", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 100,
    });

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "password123",
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe("Google");
    expect(result.email).toBe("user@gmail.com");
    expect(result.response?.success).toBe(true);
    expect(result.response?.accessToken).toBeDefined();
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it("handles invalid grant error", async () => {
    mockPost.mockResolvedValue({
      status: 400,
      statusText: "Bad Request",
      headers: {},
      data: MockOAuthServer.invalidGrantResponse(),
      responseTime: 50,
    });

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "wrongpassword",
    );

    expect(result.success).toBe(false);
    expect(result.response?.success).toBe(false);
    expect(result.response?.errorCode).toBe("invalid_grant");
  });

  it("handles network errors", async () => {
    mockPost.mockRejectedValue(new Error("Network error"));

    const result = await client.authenticate(
      "Microsoft",
      "user@outlook.com",
      "password",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it("auto-detects provider from email", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 100,
    });

    const result = await client.authenticate(
      null,
      "user@outlook.com",
      "password",
    );

    expect(result.provider).toBe("Microsoft");
  });

  it("supports proxy configuration", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 150,
    });

    const proxy: ProxyEntry = {
      host: "proxy.example.com",
      port: 8080,
      protocol: "HTTP",
    };

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "password",
      {},
      proxy,
    );

    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        proxy,
      }),
    );
  });

  it("passes custom options to request", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 100,
    });

    await client.authenticate("Yahoo", "user@yahoo.com", "password", {
      clientId: "my-client-id",
      scope: ["email", "profile"],
      state: "random-state",
    });

    expect(mockPost).toHaveBeenCalled();
  });

  it("handles access denied error", async () => {
    mockPost.mockResolvedValue({
      status: 400,
      statusText: "Bad Request",
      headers: {},
      data: MockOAuthServer.accessDeniedResponse(),
      responseTime: 50,
    });

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "password",
    );

    expect(result.success).toBe(false);
    expect(result.response?.errorCode).toBe("access_denied");
  });

  it("parses success response correctly", async () => {
    const mockResponse = {
      access_token: "test_token_123",
      refresh_token: "refresh_456",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "email profile",
    };

    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: mockResponse,
      responseTime: 100,
    });

    const result = await client.authenticate(
      "Microsoft",
      "user@outlook.com",
      "password",
    );

    expect(result.success).toBe(true);
    expect(result.response?.accessToken).toBe("test_token_123");
    expect(result.response?.refreshToken).toBe("refresh_456");
    expect(result.response?.expiresIn).toBe(3600);
    expect(result.response?.tokenType).toBe("Bearer");
  });

  it("tracks response time", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 250,
    });

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "password",
    );

    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(typeof result.responseTime).toBe("number");
  });

  it("includes endpoint URL in result", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: MockOAuthServer.successResponse(),
      responseTime: 100,
    });

    const result = await client.authenticate(
      "Google",
      "user@gmail.com",
      "password",
    );

    expect(result.endpoint).toBeDefined();
    expect(result.endpoint).toContain("googleapis.com");
  });

  describe("Retry Logic", () => {
    it("includes retry metadata when retries occurred", async () => {
      // HttpClient is mocked, so we simulate final result after retries
      mockPost.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        data: MockOAuthServer.successResponse(),
        responseTime: 100,
        retryMetadata: {
          attempts: 1,
          rateLimited: true,
          totalRetryDelay: 1000,
          delays: [1000],
        },
      });

      const result = await client.authenticate(
        "Google",
        "user@gmail.com",
        "password123",
      );

      expect(result.success).toBe(true);
      expect(result.retryMetadata).toBeDefined();
      expect(result.retryMetadata?.attempts).toBe(1);
      expect(result.retryMetadata?.rateLimited).toBe(true);
    });

    it("passes retry metadata with correct values", async () => {
      mockPost.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        data: MockOAuthServer.successResponse(),
        responseTime: 100,
        retryMetadata: {
          attempts: 3,
          rateLimited: true,
          totalRetryDelay: 7000,
          delays: [1000, 2000, 4000],
        },
      });

      const result = await client.authenticate(
        "Microsoft",
        "user@outlook.com",
        "password",
      );

      expect(result.success).toBe(true);
      expect(result.retryMetadata?.attempts).toBe(3);
      expect(result.retryMetadata?.totalRetryDelay).toBe(7000);
      expect(result.retryMetadata?.delays).toEqual([1000, 2000, 4000]);
    });

    it("works without retry metadata when no retries occurred", async () => {
      mockPost.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: {},
        data: MockOAuthServer.successResponse(),
        responseTime: 100,
        // No retryMetadata
      });

      const result = await client.authenticate(
        "Google",
        "user@gmail.com",
        "password",
      );

      expect(result.success).toBe(true);
      expect(result.retryMetadata).toBeUndefined();
    });
  });
});

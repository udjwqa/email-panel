import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../../src/services/http/client.js";
import { SessionStore } from "../../src/services/http/session-store.js";

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

describe("HttpClient with SessionStore", () => {
  let client: HttpClient;
  let sessionStore: SessionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore = new SessionStore();
    client = new HttpClient({ sessionStore });
  });

  it("includes cookies in request headers", async () => {
    // Set cookies for domain
    await sessionStore.setCookie("api.example.com", "session=abc123; Path=/");

    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { success: true },
    };

    mockRequest.mockResolvedValue(mockResponse);

    await client.get("https://api.example.com/test");

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: expect.stringContaining("session=abc123"),
        }),
      }),
    );
  });

  it("updates cookies from Set-Cookie response", async () => {
    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {
        "set-cookie": "newsession=xyz789; Path=/",
      },
      data: { success: true },
    };

    mockRequest.mockResolvedValue(mockResponse);

    await client.get("https://api.example.com/login");

    const cookies = await sessionStore.getCookies("api.example.com");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("newsession=xyz789");
  });

  it("maintains session across multiple requests", async () => {
    // First request sets cookie
    const loginResponse = {
      status: 200,
      statusText: "OK",
      headers: {
        "set-cookie": "session=logged-in; Path=/",
      },
      data: { token: "abc" },
    };

    mockRequest.mockResolvedValueOnce(loginResponse);
    await client.post("https://api.example.com/login", { user: "test" });

    // Second request should include cookie
    const dataResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { data: "secret" },
    };

    mockRequest.mockResolvedValueOnce(dataResponse);
    await client.get("https://api.example.com/data");

    expect(mockRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: expect.stringContaining("session=logged-in"),
        }),
      }),
    );
  });

  it("isolates cookies between different domains", async () => {
    await sessionStore.setCookie("api1.example.com", "token1=abc; Path=/");
    await sessionStore.setCookie("api2.example.com", "token2=xyz; Path=/");

    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: {},
    };

    mockRequest.mockResolvedValue(mockResponse);

    await client.get("https://api1.example.com/test");

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "token1=abc",
        }),
      }),
    );
  });

  it("works without session store", async () => {
    const clientWithoutSession = new HttpClient();

    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { success: true },
    };

    mockRequest.mockResolvedValue(mockResponse);

    const response =
      await clientWithoutSession.get("https://api.example.com/test");

    expect(response.status).toBe(200);
  });

  it("handles multiple Set-Cookie headers", async () => {
    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {
        "set-cookie": [
          "session=value1; Path=/",
          "token=value2; Path=/",
          "preferences=value3; Path=/",
        ],
      },
      data: {},
    };

    mockRequest.mockResolvedValue(mockResponse);

    await client.get("https://api.example.com/setup");

    const cookies = await sessionStore.getCookies("api.example.com");
    expect(cookies.length).toBeGreaterThanOrEqual(3);
  });

  it("getSessionStore returns the session store", () => {
    expect(client.getSessionStore()).toBe(sessionStore);
  });

  it("setSessionStore updates the session store", () => {
    const newStore = new SessionStore();
    client.setSessionStore(newStore);
    expect(client.getSessionStore()).toBe(newStore);
  });

  it("handles requests with no URL gracefully", async () => {
    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: {},
    };

    mockRequest.mockResolvedValue(mockResponse);

    // Request without URL should not throw
    await expect(
      client.request({ method: "GET" } as any),
    ).resolves.toBeDefined();
  });

  it("handles extraction of domain from various URL formats", async () => {
    await sessionStore.setCookie("api.example.com", "test=value; Path=/");

    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: {},
    };

    mockRequest.mockResolvedValue(mockResponse);

    // With protocol and path
    await client.get("https://api.example.com/v1/users");

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "test=value",
        }),
      }),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSocksConnection } from "../../src/services/smtp/proxy.js";
import { SmtpProxyConfig } from "../../src/services/smtp/types.js";

const mockCreateConnection = vi.fn();

vi.mock("socks", () => ({
  SocksClient: {
    createConnection: (...args: unknown[]) => mockCreateConnection(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeMockSocket() {
  return {
    setTimeout: vi.fn(),
    on: vi.fn(),
    write: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
  };
}

describe("createSocksConnection", () => {
  it("creates SOCKS5 connection to target", async () => {
    const mockSocket = makeMockSocket();
    mockCreateConnection.mockResolvedValue({ socket: mockSocket });

    const proxy: SmtpProxyConfig = { host: "proxy.local", port: 1080, type: 5 };
    const socket = await createSocksConnection(proxy, "mx.example.com", 25);

    expect(socket).toBe(mockSocket);
    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy: expect.objectContaining({ host: "proxy.local", port: 1080, type: 5 }),
        destination: { host: "mx.example.com", port: 25 },
        command: "connect",
      }),
    );
  });

  it("passes authentication credentials", async () => {
    const mockSocket = makeMockSocket();
    mockCreateConnection.mockResolvedValue({ socket: mockSocket });

    const proxy: SmtpProxyConfig = {
      host: "proxy.local",
      port: 1080,
      type: 5,
      username: "admin",
      password: "secret",
    };
    await createSocksConnection(proxy, "mx.example.com", 25);

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy: expect.objectContaining({
          userId: "admin",
          password: "secret",
        }),
      }),
    );
  });

  it("omits credentials when not provided", async () => {
    const mockSocket = makeMockSocket();
    mockCreateConnection.mockResolvedValue({ socket: mockSocket });

    const proxy: SmtpProxyConfig = { host: "proxy.local", port: 1080, type: 5 };
    await createSocksConnection(proxy, "mx.example.com", 25);

    const callArg = mockCreateConnection.mock.calls[0][0];
    expect(callArg.proxy.userId).toBeUndefined();
    expect(callArg.proxy.password).toBeUndefined();
  });

  it("supports SOCKS4 type", async () => {
    const mockSocket = makeMockSocket();
    mockCreateConnection.mockResolvedValue({ socket: mockSocket });

    const proxy: SmtpProxyConfig = { host: "proxy.local", port: 1080, type: 4 };
    await createSocksConnection(proxy, "mx.example.com", 25);

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy: expect.objectContaining({ type: 4 }),
      }),
    );
  });

  it("passes custom timeout", async () => {
    const mockSocket = makeMockSocket();
    mockCreateConnection.mockResolvedValue({ socket: mockSocket });

    const proxy: SmtpProxyConfig = { host: "proxy.local", port: 1080, type: 5 };
    await createSocksConnection(proxy, "mx.example.com", 25, 5000);

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("rejects on connection failure", async () => {
    mockCreateConnection.mockRejectedValue(new Error("SOCKS connection refused"));

    const proxy: SmtpProxyConfig = { host: "dead-proxy.local", port: 1080, type: 5 };

    await expect(
      createSocksConnection(proxy, "mx.example.com", 25),
    ).rejects.toThrow("SOCKS connection refused");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyMailbox } from "../../src/services/smtp/verifier.js";

const mockConnect = vi.fn();
const mockSendCommand = vi.fn();
const mockStartTls = vi.fn();
const mockClose = vi.fn();

vi.mock("../../src/services/smtp/client.js", () => {
  return {
    SmtpClient: class MockSmtpClient {
      connect = mockConnect;
      sendCommand = mockSendCommand;
      startTls = mockStartTls;
      close = mockClose;
    },
  };
});

const mockResolveMX = vi.fn();
vi.mock("../../src/services/smtp/resolver.js", () => ({
  resolveMX: (...args: unknown[]) => mockResolveMX(...args),
}));

function smtpResp(code: number, message: string) {
  return { code, message, isMultiline: false };
}

const defaultMx = [
  { host: "mx1.example.com", port: 25, priority: 10, isFallback: false },
];

function setupDefaultFlow(rcptCode: number, rcptMessage: string) {
  mockResolveMX.mockResolvedValue(defaultMx);
  mockConnect.mockResolvedValue(smtpResp(220, "mx1.example.com ESMTP"));
  mockSendCommand.mockImplementation((cmd: string) => {
    if (cmd.startsWith("EHLO")) return smtpResp(250, "mx1.example.com\nSIZE\nSTARTTLS");
    if (cmd.startsWith("HELO")) return smtpResp(250, "OK");
    if (cmd.startsWith("MAIL FROM")) return smtpResp(250, "OK");
    if (cmd.startsWith("RCPT TO")) return smtpResp(rcptCode, rcptMessage);
    if (cmd === "RSET") return smtpResp(250, "OK");
    if (cmd === "QUIT") return smtpResp(221, "Bye");
    return smtpResp(500, "Unknown");
  });
  mockStartTls.mockResolvedValue(true);
  mockClose.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyMailbox", () => {
  it("returns deliverable for RCPT TO 250", async () => {
    setupDefaultFlow(250, "OK");

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("deliverable");
    expect(result.smtpCode).toBe(250);
    expect(result.email).toBe("user@example.com");
    expect(result.mxHost).toBe("mx1.example.com");
    expect(result.error).toBeNull();
  });

  it("returns undeliverable for RCPT TO 550", async () => {
    setupDefaultFlow(550, "User not found");

    const result = await verifyMailbox("nobody@example.com");

    expect(result.status).toBe("undeliverable");
    expect(result.smtpCode).toBe(550);
    expect(result.smtpMessage).toBe("User not found");
  });

  it("returns undeliverable for RCPT TO 553", async () => {
    setupDefaultFlow(553, "Mailbox name not allowed");

    const result = await verifyMailbox("bad@example.com");

    expect(result.status).toBe("undeliverable");
    expect(result.smtpCode).toBe(553);
  });

  it("falls back to next MX on 421", async () => {
    mockResolveMX.mockResolvedValue([
      { host: "mx1.example.com", port: 25, priority: 10, isFallback: false },
      { host: "mx2.example.com", port: 25, priority: 20, isFallback: false },
    ]);

    let callCount = 0;
    mockConnect.mockImplementation(() => {
      callCount++;
      return smtpResp(220, `mx${callCount}.example.com ESMTP`);
    });

    mockSendCommand.mockImplementation((cmd: string) => {
      if (cmd.startsWith("EHLO")) return smtpResp(250, "Hello\nSTARTTLS");
      if (cmd.startsWith("MAIL FROM")) return smtpResp(250, "OK");
      if (cmd.startsWith("RCPT TO")) {
        if (callCount === 1) return smtpResp(421, "Service not available");
        return smtpResp(250, "OK");
      }
      if (cmd === "RSET") return smtpResp(250, "OK");
      if (cmd === "QUIT") return smtpResp(221, "Bye");
      return smtpResp(500, "Unknown");
    });
    mockStartTls.mockResolvedValue(true);
    mockClose.mockResolvedValue(undefined);

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("deliverable");
    expect(result.mxHost).toBe("mx2.example.com");
    expect(callCount).toBe(2);
  });

  it("returns risky for RCPT TO 450 (greylisting)", async () => {
    setupDefaultFlow(450, "Greylisted, try again later");

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("risky");
    expect(result.smtpCode).toBe(450);
  });

  it("returns error when no MX records", async () => {
    mockResolveMX.mockResolvedValue([]);

    const result = await verifyMailbox("user@nonexistent.invalid");

    expect(result.status).toBe("error");
    expect(result.error).toContain("No MX records");
  });

  it("returns error when all MX hosts fail", async () => {
    mockResolveMX.mockResolvedValue(defaultMx);
    mockConnect.mockRejectedValue(new Error("Connection refused"));
    mockClose.mockResolvedValue(undefined);

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("error");
    expect(result.error).toContain("Connection refused");
  });

  it("returns error when MAIL FROM is rejected", async () => {
    mockResolveMX.mockResolvedValue(defaultMx);
    mockConnect.mockResolvedValue(smtpResp(220, "ESMTP"));
    mockSendCommand.mockImplementation((cmd: string) => {
      if (cmd.startsWith("EHLO")) return smtpResp(250, "OK");
      if (cmd.startsWith("MAIL FROM")) return smtpResp(550, "Sender rejected");
      if (cmd === "QUIT") return smtpResp(221, "Bye");
      return smtpResp(500, "Unknown");
    });
    mockStartTls.mockResolvedValue(false);
    mockClose.mockResolvedValue(undefined);

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("error");
    expect(result.error).toContain("MAIL FROM rejected");
  });

  it("returns timeout when connection times out", async () => {
    mockResolveMX.mockResolvedValue(defaultMx);
    mockConnect.mockRejectedValue(
      new Error("Connection timeout after 30000ms"),
    );
    mockClose.mockResolvedValue(undefined);

    const result = await verifyMailbox("user@example.com");

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("timeout");
  });

  it("returns error for invalid email without domain", async () => {
    const result = await verifyMailbox("nodomain");

    expect(result.status).toBe("error");
    expect(result.error).toContain("Invalid email");
  });

  it("records responseTime > 0", async () => {
    setupDefaultFlow(250, "OK");

    const result = await verifyMailbox("user@example.com");

    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });
});

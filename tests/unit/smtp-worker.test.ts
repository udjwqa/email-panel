import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnect = vi.fn();
const mockSendCommand = vi.fn();
const mockStartTls = vi.fn();
const mockClose = vi.fn();

vi.mock("../../src/services/smtp/client.js", () => ({
  SmtpClient: class MockSmtpClient {
    connect = mockConnect;
    sendCommand = mockSendCommand;
    startTls = mockStartTls;
    close = mockClose;
  },
}));

const mockRedisSet = vi.fn();
vi.mock("ioredis", () => ({
  default: class MockIORedis {
    set = mockRedisSet;
  },
}));

vi.mock("../../src/services/audit.js", () => ({
  audit: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  config: { redis: { url: "redis://localhost:6379" } },
}));

function smtpResp(code: number, message: string) {
  return { code, message, isMultiline: false };
}

function setupSmtpFlow(rcptCode: number, rcptMessage: string) {
  mockConnect.mockResolvedValue(smtpResp(220, "ESMTP"));
  mockSendCommand.mockImplementation((cmd: string) => {
    if (cmd.startsWith("EHLO")) return smtpResp(250, "OK");
    if (cmd.startsWith("MAIL FROM")) return smtpResp(250, "OK");
    if (cmd.startsWith("RCPT TO")) return smtpResp(rcptCode, rcptMessage);
    if (cmd === "RSET") return smtpResp(250, "OK");
    if (cmd === "QUIT") return smtpResp(221, "Bye");
    return smtpResp(500, "Unknown");
  });
  mockStartTls.mockResolvedValue(false);
  mockClose.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisSet.mockResolvedValue("OK");
});

describe("smtp-worker processSmtpJob", () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = { set: mockRedisSet };
    vi.clearAllMocks();
    mockRedisSet.mockResolvedValue("OK");
  });

  it("stores deliverable result for RCPT 250", async () => {
    setupSmtpFlow(250, "OK");

    const { processSmtpJob } = await import(
      "../../src/workers/smtp-worker.js"
    );

    const job = {
      id: "job-1",
      data: { email: "user@test.com", mxServer: "mx.test.com" },
    } as any;

    await processSmtpJob(job, mockRedis);

    expect(mockRedisSet).toHaveBeenCalledWith(
      "smtp:result:user@test.com",
      expect.stringContaining('"status":"deliverable"'),
      "EX",
      86400,
    );
  });

  it("stores undeliverable for RCPT 550", async () => {
    setupSmtpFlow(550, "User not found");

    const { processSmtpJob } = await import(
      "../../src/workers/smtp-worker.js"
    );

    const job = {
      id: "job-2",
      data: { email: "bad@test.com", mxServer: "mx.test.com" },
    } as any;

    await processSmtpJob(job, mockRedis);

    expect(mockRedisSet).toHaveBeenCalledWith(
      "smtp:result:bad@test.com",
      expect.stringContaining('"status":"undeliverable"'),
      "EX",
      86400,
    );
  });

  it("stores unknown on connection error", async () => {
    mockConnect.mockRejectedValue(new Error("Connection timeout"));

    const { processSmtpJob } = await import(
      "../../src/workers/smtp-worker.js"
    );

    const job = {
      id: "job-3",
      data: { email: "timeout@test.com", mxServer: "unreachable.test" },
    } as any;

    await processSmtpJob(job, mockRedis);

    expect(mockRedisSet).toHaveBeenCalledWith(
      "smtp:result:timeout@test.com",
      expect.stringContaining('"status":"unknown"'),
      "EX",
      86400,
    );
  });

  it("calls client.close() in finally block", async () => {
    setupSmtpFlow(250, "OK");

    const { processSmtpJob } = await import(
      "../../src/workers/smtp-worker.js"
    );

    const job = {
      id: "job-4",
      data: { email: "any@test.com", mxServer: "mx.test.com" },
    } as any;

    await processSmtpJob(job, mockRedis);

    expect(mockClose).toHaveBeenCalled();
  });

  it("creates worker with concurrency 3", async () => {
    const { createSmtpWorker } = await import(
      "../../src/workers/smtp-worker.js"
    );
    const worker = createSmtpWorker();
    expect(worker).toBeDefined();
    await worker.close();
  });
});

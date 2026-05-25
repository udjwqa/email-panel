import { describe, it, expect, vi, beforeEach } from "vitest";
import { processBatch } from "../../src/services/imap/batch.js";

const { mockTryAuthenticate, mockPrismaCreate, mockSaveAuthResult } =
  vi.hoisted(() => ({
    mockTryAuthenticate: vi.fn(),
    mockPrismaCreate: vi.fn(),
    mockSaveAuthResult: vi.fn(),
  }));

vi.mock("../../src/services/imap/verifier.js", () => ({
  IMAPVerifier: class {
    tryAuthenticate = mockTryAuthenticate;
  },
}));

vi.mock("../../src/services/auth-results/aggregator.js", () => ({
  saveAuthResult: mockSaveAuthResult,
}));

const mockPrisma = {
  imapCheckResult: {
    create: mockPrismaCreate,
  },
  $disconnect: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrismaCreate.mockResolvedValue({});
  mockSaveAuthResult.mockResolvedValue({});
});

describe("processBatch", () => {
  const credentials = [
    {
      email: "user1@test.com",
      password: "pass1",
      host: "imap.test.com",
      port: 993,
      tls: true,
    },
    {
      email: "user2@test.com",
      password: "pass2",
      host: "imap.test.com",
      port: 993,
      tls: true,
    },
  ];

  it("processes empty batch", async () => {
    const result = await processBatch([], 5, mockPrisma as any);

    expect(result.total).toBe(0);
    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("processes single credential successfully", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: true,
      errorType: null,
    });

    const result = await processBatch([credentials[0]], 5, mockPrisma as any);

    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockPrismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "user1@test.com",
          success: true,
        }),
      }),
    );
  });

  it("processes batch with failures", async () => {
    mockTryAuthenticate.mockResolvedValueOnce({
      success: true,
      errorType: null,
    });
    mockTryAuthenticate.mockResolvedValueOnce({
      success: false,
      errorType: "auth_failed",
      message: "Authentication failed",
    });

    const result = await processBatch(credentials, 5, mockPrisma as any);

    expect(result.total).toBe(2);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockPrismaCreate).toHaveBeenCalledTimes(2);
  });

  it("saves error details to database", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: false,
      errorType: "timeout",
      message: "Connection timeout",
    });

    await processBatch([credentials[0]], 5, mockPrisma as any);

    expect(mockPrismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          success: false,
          errorType: "timeout",
          message: "Connection timeout",
        }),
      }),
    );
  });

  it("handles processing errors", async () => {
    mockTryAuthenticate.mockRejectedValue(new Error("Network error"));

    const result = await processBatch([credentials[0]], 5, mockPrisma as any);

    expect(result.errors).toBe(1);
    expect(mockPrismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorType: "processing_error",
          message: "Network error",
        }),
      }),
    );
  });

  it("respects concurrency limit", async () => {
    mockTryAuthenticate.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, errorType: null }),
            100,
          ),
        ),
    );

    const largeBatch = Array(10)
      .fill(credentials[0])
      .map((c, i) => ({ ...c, email: `user${i}@test.com` }));

    const result = await processBatch(largeBatch, 2, mockPrisma as any);

    expect(result.total).toBe(10);
    expect(result.successful).toBe(10);
  });

  it("counts protected accounts separately", async () => {
    mockTryAuthenticate.mockResolvedValueOnce({
      success: false,
      errorType: "additional_verification_required",
      message: "Protection detected: captcha",
    });
    mockTryAuthenticate.mockResolvedValueOnce({
      success: false,
      errorType: "auth_failed",
      message: "Authentication failed",
    });

    const result = await processBatch(credentials, 5, mockPrisma as any);

    expect(result.total).toBe(2);
    expect(result.protected).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.successful).toBe(0);
  });

  it("saves results to AuthResult table", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: true,
      errorType: null,
      message: "OK",
    });

    await processBatch([credentials[0]], 5, mockPrisma as any);

    expect(mockSaveAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user1@test.com",
        protocol: "IMAP",
        status: "success",
      }),
    );
  });

  it("applies jitter between attempts when enabled", async () => {
    const startTimes: number[] = [];

    mockTryAuthenticate.mockImplementation(async () => {
      startTimes.push(Date.now());
      return { success: true, errorType: null };
    });

    await processBatch(
      [credentials[0], credentials[1]],
      5,
      mockPrisma as any,
      10_000,
      true, // useJitter
    );

    // Проверить, что между вызовами есть задержка
    if (startTimes.length >= 2) {
      const delay = startTimes[1] - startTimes[0];
      expect(delay).toBeGreaterThanOrEqual(1000); // минимальный jitter
    }
  });
});

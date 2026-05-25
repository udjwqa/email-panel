import { describe, it, expect, vi, beforeEach } from "vitest";
import { processPOP3Batch } from "../../src/services/pop3/batch.js";

const {
  mockTryAuthenticate,
  mockPrismaDisconnect,
  mockSaveAuthResult,
} = vi.hoisted(() => ({
  mockTryAuthenticate: vi.fn(),
  mockPrismaDisconnect: vi.fn(),
  mockSaveAuthResult: vi.fn(),
}));

vi.mock("../../src/services/pop3/verifier.js", () => ({
  POP3Verifier: class {
    tryAuthenticate = mockTryAuthenticate;
  },
}));

vi.mock("../../src/services/auth-results/aggregator.js", () => ({
  saveAuthResult: mockSaveAuthResult,
}));

const mockPrisma = {
  $disconnect: mockPrismaDisconnect,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveAuthResult.mockResolvedValue({});
});

describe("processPOP3Batch", () => {
  const credentials = [
    {
      email: "user1@test.com",
      password: "pass1",
      host: "pop.test.com",
      port: 995,
      tls: true,
    },
    {
      email: "user2@test.com",
      password: "pass2",
      host: "pop.test.com",
      port: 995,
      tls: true,
    },
  ];

  it("processes empty batch", async () => {
    const result = await processPOP3Batch([], 5, mockPrisma as any);

    expect(result.total).toBe(0);
    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("processes successful authentication", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: true,
      errorType: null,
      message: "OK",
      responseTime: 150,
    });

    const result = await processPOP3Batch([credentials[0]], 5, mockPrisma as any);

    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSaveAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user1@test.com",
        protocol: "POP3",
        status: "success",
      }),
    );
  });

  it("processes failed authentication", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: false,
      errorType: "auth_failed",
      message: "Authentication failed",
      responseTime: 100,
    });

    const result = await processPOP3Batch([credentials[0]], 5, mockPrisma as any);

    expect(result.failed).toBe(1);
  });

  it("counts protected accounts separately", async () => {
    mockTryAuthenticate.mockResolvedValueOnce({
      success: false,
      errorType: "additional_verification_required",
      message: "CAPTCHA required",
    });
    mockTryAuthenticate.mockResolvedValueOnce({
      success: false,
      errorType: "auth_failed",
      message: "Auth failed",
    });

    const result = await processPOP3Batch(credentials, 5, mockPrisma as any);

    expect(result.protected).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("handles processing errors", async () => {
    mockTryAuthenticate.mockRejectedValue(new Error("Network error"));

    const result = await processPOP3Batch([credentials[0]], 5, mockPrisma as any);

    expect(result.errors).toBe(1);
    expect(mockSaveAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "auth_failed",
        errorMessage: "Network error",
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

    const result = await processPOP3Batch(largeBatch, 2, mockPrisma as any);

    expect(result.total).toBe(10);
    expect(result.successful).toBe(10);
  });

  it("saves results to AuthResult", async () => {
    mockTryAuthenticate.mockResolvedValue({
      success: true,
      errorType: null,
      responseTime: 200,
    });

    await processPOP3Batch([credentials[0]], 5, mockPrisma as any);

    expect(mockSaveAuthResult).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: "POP3",
        status: "success",
        responseTime: 200,
      }),
    );
  });
});

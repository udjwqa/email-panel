import { describe, it, expect, vi } from "vitest";
import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";

vi.mock("../../src/services/db.js", () => ({
  db: {
    proxy: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("AuthAttemptController", () => {
  it("allows attempts when enabled", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 10,
      jitterFactor: 0,
      maxAttemptsPerEmail: 5,
      proxyRotateEvery: 3,
      domainCooldownMs: 100,
    });

    const check = await controller.beforeAttempt("test@gmail.com");
    expect(check.allowed).toBe(true);
  });

  it("blocks after max attempts per email", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 1,
      jitterFactor: 0,
      maxAttemptsPerEmail: 3,
      proxyRotateEvery: 10,
      domainCooldownMs: 100,
    });

    for (let i = 0; i < 3; i++) {
      await controller.beforeAttempt("test@gmail.com");
      controller.afterAttempt("test@gmail.com", false);
    }

    const check = await controller.beforeAttempt("test@gmail.com");
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("max_attempts_reached");
  });

  it("tracks different emails independently", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 1,
      jitterFactor: 0,
      maxAttemptsPerEmail: 2,
      proxyRotateEvery: 10,
      domainCooldownMs: 100,
    });

    for (let i = 0; i < 2; i++) {
      await controller.beforeAttempt("a@gmail.com");
      controller.afterAttempt("a@gmail.com", false);
    }

    const checkA = await controller.beforeAttempt("a@gmail.com");
    expect(checkA.allowed).toBe(false);

    const checkB = await controller.beforeAttempt("b@gmail.com");
    expect(checkB.allowed).toBe(true);
  });

  it("resets email counter", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 1,
      jitterFactor: 0,
      maxAttemptsPerEmail: 2,
      proxyRotateEvery: 10,
      domainCooldownMs: 100,
    });

    for (let i = 0; i < 2; i++) {
      await controller.beforeAttempt("test@gmail.com");
      controller.afterAttempt("test@gmail.com", false);
    }

    controller.resetEmail("test@gmail.com");

    const check = await controller.beforeAttempt("test@gmail.com");
    expect(check.allowed).toBe(true);
  });

  it("returns stats", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 1,
      jitterFactor: 0,
      maxAttemptsPerEmail: 10,
      proxyRotateEvery: 5,
      domainCooldownMs: 100,
    });

    await controller.beforeAttempt("test@gmail.com");
    controller.afterAttempt("test@gmail.com", false);

    const stats = controller.getStats();
    expect(stats.totalAttempts).toBe(1);
    expect(stats.emailsTracked).toBe(1);
    expect(stats.config.enabled).toBe(true);
  });

  it("resets all state", async () => {
    const controller = new AuthAttemptController({
      enabled: true,
      delayMs: 1,
      jitterFactor: 0,
      maxAttemptsPerEmail: 10,
      proxyRotateEvery: 5,
      domainCooldownMs: 100,
    });

    await controller.beforeAttempt("test@gmail.com");
    controller.afterAttempt("test@gmail.com", false);

    controller.resetAll();

    const stats = controller.getStats();
    expect(stats.totalAttempts).toBe(0);
    expect(stats.emailsTracked).toBe(0);
  });
});

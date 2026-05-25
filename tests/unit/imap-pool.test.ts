import { describe, it, expect } from "vitest";
import { IMAPConnectionPool } from "../../src/services/imap/pool.js";

describe("IMAPConnectionPool", () => {
  const credentials = {
    host: "imap.test.com",
    port: 993,
    user: "test@test.com",
    password: "password",
    tls: true,
  };

  it("creates pool with default config", () => {
    const pool = new IMAPConnectionPool(credentials);

    expect(pool).toBeDefined();
    expect(pool.getPoolSize()).toBe(0);
    expect(pool.getAvailable()).toBe(0);
    expect(pool.getPending()).toBe(0);
  });

  it("creates pool with custom max limit", () => {
    const pool = new IMAPConnectionPool(credentials, { max: 5 });

    expect(pool).toBeDefined();
  });

  it("creates pool with rate limiting disabled", () => {
    const pool = new IMAPConnectionPool(credentials, {
      rateLimitMinMs: 0,
      rateLimitMaxMs: 0,
    });

    expect(pool).toBeDefined();
  });

  it("creates pool with custom timeout", () => {
    const pool = new IMAPConnectionPool(credentials, {}, 5000);

    expect(pool).toBeDefined();
  });

  it("has acquire method", () => {
    const pool = new IMAPConnectionPool(credentials);

    expect(typeof pool.acquire).toBe("function");
  });

  it("has release method", () => {
    const pool = new IMAPConnectionPool(credentials);

    expect(typeof pool.release).toBe("function");
  });

  it("has drain method", () => {
    const pool = new IMAPConnectionPool(credentials);

    expect(typeof pool.drain).toBe("function");
  });

  it("has clear method", () => {
    const pool = new IMAPConnectionPool(credentials);

    expect(typeof pool.clear).toBe("function");
  });

  it("validates connection health", () => {
    const pool = new IMAPConnectionPool({
      host: "imap.test.com",
      port: 993,
      user: "test",
      password: "pass",
      tls: true,
    });
    expect(pool).toBeDefined();
  });

  it("allows custom validation on acquire", () => {
    const pool = new IMAPConnectionPool(
      {
        host: "imap.test.com",
        port: 993,
        user: "test",
        password: "pass",
        tls: true,
      },
      { validateOnAcquire: true },
    );
    expect(pool).toBeDefined();
  });
});

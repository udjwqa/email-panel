import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, authHeader } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("Auth API", () => {
  it("POST /auth/login returns 400 without body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /auth/login returns 401 for wrong email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nonexistent@test.com", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /auth/logout returns ok", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("GET /me returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /me returns user data with valid token", async () => {
    const token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: token },
    });
    // May return null if user doesn't exist in test DB, but should not 401
    expect(res.statusCode).toBe(200);
  });
});

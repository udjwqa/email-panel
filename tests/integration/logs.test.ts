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

describe("Logs API", () => {
  it("GET /logs returns logs for admin", async () => {
    const token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/logs",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("logs");
    expect(Array.isArray(res.json().logs)).toBe(true);
  });

  it("GET /logs supports level filter", async () => {
    const token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/logs?level=ERROR&limit=10",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET /logs returns 403 for non-admin", async () => {
    const token = authHeader(app, { id: 2, role: "VIEWER", isAdmin: false });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/logs",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(403);
  });
});

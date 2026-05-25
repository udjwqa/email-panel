import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, authHeader } from "./helpers.js";

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await createTestApp();
  token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
});

afterAll(async () => {
  await app.close();
});

describe("Stats API", () => {
  it("GET /stats/summary returns structure", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stats/summary?period=24h",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("period", "24h");
    expect(body).toHaveProperty("tasks");
    expect(body).toHaveProperty("emails");
    expect(body).toHaveProperty("users");
    expect(body).toHaveProperty("domains");
  });

  it("GET /stats/domains returns array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stats/domains",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("domains");
    expect(Array.isArray(res.json().domains)).toBe(true);
  });

  it("GET /stats/errors returns array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stats/errors",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("errors");
    expect(Array.isArray(res.json().errors)).toBe(true);
  });

  it("GET /stats/summary requires auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/stats/summary",
    });
    expect(res.statusCode).toBe(401);
  });
});

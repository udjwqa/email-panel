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

describe("Settings API", () => {
  it("GET /settings returns settings for admin", async () => {
    const token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("settings");
    expect(res.json()).toHaveProperty("labels");
  });

  it("GET /settings returns 403 for viewer", async () => {
    const token = authHeader(app, { id: 2, role: "VIEWER", isAdmin: false });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT /settings updates value for admin", async () => {
    const token = authHeader(app, { id: 1, role: "ADMIN", isAdmin: true });
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: token },
      payload: { key: "daily_task_limit", value: "100" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("PUT /settings returns 403 for non-admin", async () => {
    const token = authHeader(app, { id: 2, role: "MANAGER", isAdmin: false });
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: token },
      payload: { key: "daily_task_limit", value: "100" },
    });
    expect(res.statusCode).toBe(403);
  });
});

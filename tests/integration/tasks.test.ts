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

describe("Tasks API", () => {
  it("GET /tasks returns list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("tasks");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  it("GET /tasks supports pagination", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks?page=1&limit=5",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().limit).toBe(5);
  });

  it("GET /tasks/:id returns 404 for non-existent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/999999",
      headers: { authorization: token },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /tasks requires auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
    });
    expect(res.statusCode).toBe(401);
  });
});

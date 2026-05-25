import Fastify, { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import cors from "@fastify/cors";
import { healthRoutes } from "../../src/api/routes/health.js";
import { authRoutes } from "../../src/api/routes/auth.js";
import { taskRoutes } from "../../src/api/routes/tasks.js";
import { statsRoutes } from "../../src/api/routes/stats.js";
import { settingsRoutes } from "../../src/api/routes/settings.js";
import { logRoutes } from "../../src/api/routes/logs.js";

const JWT_SECRET = "test-secret-key";

export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors);
  await app.register(fastifyJwt, { secret: JWT_SECRET });
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  await app.register(healthRoutes);
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(taskRoutes);
      await api.register(statsRoutes);
      await api.register(settingsRoutes);
      await api.register(logRoutes);
    },
    { prefix: "/api/v1" },
  );

  await app.ready();
  return app;
}

export function authHeader(
  app: FastifyInstance,
  user: { id: number; role: string; isAdmin: boolean },
): string {
  const token = app.jwt.sign(user, { expiresIn: "1h" });
  return `Bearer ${token}`;
}

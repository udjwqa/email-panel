import { FastifyInstance } from "fastify";
import { LogLevel } from "@prisma/client";
import { db } from "../../services/db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

export async function logRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{ Querystring: { level?: string; limit?: string } }>(
    "/logs",
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
      const levelFilter = request.query.level?.toUpperCase();

      const validLevels: LogLevel[] = ["INFO", "WARNING", "ERROR", "CRITICAL"];
      const where = levelFilter && validLevels.includes(levelFilter as LogLevel)
        ? { level: levelFilter as LogLevel }
        : {};

      const logs = await db.log.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return { logs, count: logs.length };
    },
  );
}

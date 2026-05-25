import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import IORedis from "ioredis";
import { config } from "../../config.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    let dbStatus = "disconnected";
    let redisStatus = "disconnected";

    try {
      await db.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch {}

    try {
      const redis = new IORedis(config.redis.url, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
      });
      await redis.ping();
      dbStatus === "connected" && (redisStatus = "connected");
      redis.disconnect();
      redisStatus = "connected";
    } catch {}

    const allHealthy = dbStatus === "connected" && redisStatus === "connected";

    return {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  });
}

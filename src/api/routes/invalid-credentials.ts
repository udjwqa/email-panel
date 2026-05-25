import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import {
  archiveInvalidCredentials,
  restoreFromArchive,
  getArchivalStats,
} from "../../services/invalid-credentials/archiver.js";
import { invalidCredsCleanupQueue } from "../../services/queue.js";

export async function invalidCredentialsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{
    Body: {
      olderThanDays?: number;
      dryRun?: boolean;
    };
  }>("/invalid-credentials/archive", async (request) => {
    const result = await archiveInvalidCredentials(
      {
        olderThanDays: request.body.olderThanDays,
        dryRun: request.body.dryRun ?? false,
      },
      request.user.id,
    );

    return result;
  });

  app.post("/invalid-credentials/cleanup", async (request, reply) => {
    if (!request.user.isAdmin) {
      return reply.code(403).send({ error: "Admin access required" });
    }

    const job = await invalidCredsCleanupQueue.add("manual-cleanup", {
      manual: true,
      userId: request.user.id,
    });

    return {
      jobId: job.id,
      message: "Cleanup job queued",
    };
  });

  app.post<{
    Body: {
      archiveIds: number[];
    };
  }>("/invalid-credentials/restore", async (request, reply) => {
    if (!request.user.isAdmin) {
      return reply.code(403).send({ error: "Admin access required" });
    }

    const restored = await restoreFromArchive(
      request.body.archiveIds,
      request.user.id,
    );

    return { restored };
  });

  app.get("/invalid-credentials/stats", async () => {
    const stats = await getArchivalStats();
    return stats;
  });
}

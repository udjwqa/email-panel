import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { matchingQueue } from "../../services/queue.js";
import {
  getFoundMatches,
  getMatchingStats,
} from "../../services/matching/engine.js";

export async function matchingRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{
    Body: {
      taskId?: number;
      emails?: string[];
      dictionaryIds: number[];
      method?: "imap" | "oauth";
    };
  }>("/matching/start", async (request) => {
    const job = await matchingQueue.add("matching", {
      userId: request.user.id,
      taskId: request.body.taskId,
      emails: request.body.emails,
      dictionaryIds: request.body.dictionaryIds,
      method: request.body.method,
    });

    return { jobId: job.id, message: "Matching started" };
  });

  app.get("/matching/stats", async (request) => {
    return getMatchingStats(request.user.id);
  });

  app.get("/matching/results", async (request) => {
    return getFoundMatches(request.user.id);
  });
}

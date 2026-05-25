import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import {
  getRecoveredCredentials,
  getRecoveryStats,
  deleteRecoveredCredential,
  exportRecoveredCredentials,
} from "../../services/matching/recovered-credentials.js";

export async function recoveredRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: { accessLevel?: string; method?: string };
  }>("/recovered", async (request) => {
    return getRecoveredCredentials(request.user.id, {
      accessLevel: request.query.accessLevel,
      method: request.query.method,
    });
  });

  app.get("/recovered/stats", async (request) => {
    return getRecoveryStats(request.user.id);
  });

  app.get<{
    Querystring: { format?: "csv" | "txt" };
  }>("/recovered/export", async (request, reply) => {
    const format = request.query.format ?? "csv";
    const buffer = await exportRecoveredCredentials(request.user.id, format);
    const fileName = `recovered_${Date.now()}.${format}`;

    reply
      .header("Content-Type", format === "csv" ? "text/csv" : "text/plain")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);
  });

  app.delete<{ Params: { id: string } }>(
    "/recovered/:id",
    async (request) => {
      await deleteRecoveredCredential(
        Number(request.params.id),
        request.user.id,
      );
      return { success: true };
    },
  );
}

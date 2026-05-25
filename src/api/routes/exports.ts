import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { generateExport } from "../../services/exporter.js";
import { authenticate } from "../middleware/auth.js";

export async function exportRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{
    Body: {
      taskId?: number;
      statuses?: string[];
      domainGroup?: string;
      datePreset?: string;
      uniqueOnly?: boolean;
      format?: "txt" | "csv";
    };
  }>("/exports", async (request) => {
    const filters = request.body ?? {};
    const result = await generateExport(request.user.id, filters);

    return {
      exportId: result.exportId,
      count: result.count,
      fileName: result.fileName,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/exports/:id/download",
    async (request, reply) => {
      const exportRecord = await db.export.findUnique({
        where: { id: Number(request.params.id) },
      });

      if (!exportRecord || exportRecord.userId !== request.user.id) {
        return reply.code(404).send({ error: "Export not found" });
      }

      const result = await generateExport(
        request.user.id,
        exportRecord.filters as any,
      );

      const ext = (exportRecord.filters as any)?.format === "csv" ? "csv" : "txt";

      reply
        .header("Content-Type", ext === "csv" ? "text/csv" : "text/plain")
        .header("Content-Disposition", `attachment; filename="${result.fileName}"`)
        .send(result.buffer);
    },
  );
}

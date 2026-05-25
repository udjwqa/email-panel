import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import {
  generateValidatedExport,
  getValidatedExportFile,
  ValidatedCredentialsFilters,
} from "../../services/validated-credentials-exporter.js";
import { db } from "../../services/db.js";

export async function validatedExportRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // POST /api/v1/exports/validated - Create export
  app.post<{
    Body: {
      accountStatuses?: string[];
      dateFrom?: string;
      dateTo?: string;
      protocol?: string;
      uniqueOnly?: boolean;
      format?: "txt" | "csv";
    };
  }>("/exports/validated", async (request) => {
    const filters: ValidatedCredentialsFilters = {
      accountStatuses: request.body.accountStatuses,
      dateFrom: request.body.dateFrom
        ? new Date(request.body.dateFrom)
        : undefined,
      dateTo: request.body.dateTo ? new Date(request.body.dateTo) : undefined,
      protocol: request.body.protocol,
      uniqueOnly: request.body.uniqueOnly ?? true,
      format: request.body.format ?? "csv",
    };

    const result = await generateValidatedExport(request.user.id, filters);

    return {
      exportId: result.exportId,
      count: result.count,
      fileName: result.fileName,
      filePath: result.filePath,
    };
  });

  // GET /api/v1/exports/validated/:id/download - Download file
  app.get<{ Params: { id: string } }>(
    "/exports/validated/:id/download",
    async (request, reply) => {
      const exportRecord = await db.export.findUnique({
        where: { id: Number(request.params.id) },
      });

      if (!exportRecord || exportRecord.userId !== request.user.id) {
        return reply.code(404).send({ error: "Export not found" });
      }

      if (!exportRecord.filePath) {
        return reply.code(404).send({ error: "Export file not found" });
      }

      const buffer = await getValidatedExportFile(exportRecord.filePath);
      const ext = exportRecord.filePath.endsWith(".csv") ? "csv" : "txt";
      const fileName = exportRecord.filePath.split("/").pop() || "export.txt";

      reply
        .header("Content-Type", ext === "csv" ? "text/csv" : "text/plain")
        .header("Content-Disposition", `attachment; filename="${fileName}"`)
        .send(buffer);
    },
  );
}

import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { generateAuditReport } from "../../services/audit-report/generator.js";
import { formatAuditReportText } from "../../services/audit-report/formatter.js";
import type { AuditReportFilters } from "../../services/audit-report/types.js";

export async function auditReportRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: {
      format?: "json" | "text";
      dateFrom?: string;
      dateTo?: string;
      protocol?: string;
    };
  }>("/audit/report", async (request, reply) => {
    const filters: AuditReportFilters = {
      dateFrom: request.query.dateFrom
        ? new Date(request.query.dateFrom)
        : undefined,
      dateTo: request.query.dateTo
        ? new Date(request.query.dateTo)
        : undefined,
      protocol: request.query.protocol,
      userId: request.user.isAdmin ? undefined : request.user.id,
    };

    const report = await generateAuditReport(filters);

    if (request.query.format === "text") {
      const text = formatAuditReportText(report);
      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .send(text);
      return;
    }

    return report;
  });
}

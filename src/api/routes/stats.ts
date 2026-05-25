import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { authenticate } from "../middleware/auth.js";

export async function statsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{ Querystring: { period?: string } }>(
    "/stats/summary",
    async (request) => {
      const period = request.query.period ?? "24h";
      const since = periodToDate(period);
      const dateFilter = since ? { gte: since } : undefined;
      const taskWhere = dateFilter ? { createdAt: dateFilter } : {};
      const emailWhere = dateFilter ? { createdAt: dateFilter } : {};

      const [tasks, emails, users, domains, taskStatuses, emailStatuses] =
        await Promise.all([
          db.task.count({ where: taskWhere }),
          db.email.count({ where: emailWhere }),
          db.user.count(),
          db.domain.count(),
          db.task.groupBy({ by: ["status"], where: taskWhere, _count: true }),
          db.email.groupBy({ by: ["status"], where: emailWhere, _count: true }),
        ]);

      return {
        period,
        tasks: {
          total: tasks,
          byStatus: Object.fromEntries(taskStatuses.map((s) => [s.status, s._count])),
        },
        emails: {
          total: emails,
          byStatus: Object.fromEntries(emailStatuses.map((s) => [s.status, s._count])),
        },
        users,
        domains,
      };
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/stats/domains",
    async (request) => {
      const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));

      const topDomains = await db.email.groupBy({
        by: ["domain"],
        _count: { domain: true },
        orderBy: { _count: { domain: "desc" } },
        take: limit,
      });

      return { domains: topDomains.map((d) => ({ domain: d.domain, count: d._count.domain })) };
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/stats/errors",
    async (request) => {
      const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));

      const topErrors = await db.email.groupBy({
        by: ["errorReason"],
        where: { status: "ERROR", errorReason: { not: null } },
        _count: true,
        orderBy: { _count: { errorReason: "desc" } },
        take: limit,
      });

      return { errors: topErrors.map((e) => ({ reason: e.errorReason, count: e._count })) };
    },
  );
}

function periodToDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "1h": return new Date(now.getTime() - 3600_000);
    case "24h": return new Date(now.getTime() - 86400_000);
    case "7d": return new Date(now.getTime() - 7 * 86400_000);
    case "30d": return new Date(now.getTime() - 30 * 86400_000);
    default: return null;
  }
}

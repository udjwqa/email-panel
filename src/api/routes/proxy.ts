import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { proxyCheckQueue } from "../../services/queue.js";
import { loadFromText, getStats, removeDead } from "../../services/proxy/pool.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { audit } from "../../services/audit.js";

export async function proxyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: { status?: string; protocol?: string; page?: string; limit?: string };
  }>("/proxies", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));

    const where: any = {};
    if (request.query.status) where.status = request.query.status;
    if (request.query.protocol) where.protocol = request.query.protocol;

    const [proxies, total] = await Promise.all([
      db.proxy.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.proxy.count({ where }),
    ]);

    return { proxies, total, page, limit };
  });

  app.get("/proxies/stats", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return getStats();
  });

  app.post<{ Body: { text: string } }>(
    "/proxies/upload",
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const { text } = request.body ?? {};
      if (!text) return reply.code(400).send({ error: "text required" });

      const result = await loadFromText(text);
      audit({ userId: request.user.id, type: "proxy_uploaded", level: "INFO", message: `API: loaded ${result.validLines} proxies` });

      return { loaded: result.validLines, duplicates: result.duplicateCount, total: result.totalLines };
    },
  );

  app.post("/proxies/check", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    await proxyCheckQueue.add("check-all", { mode: "all" });
    audit({ userId: request.user.id, type: "proxy_check_started", level: "INFO", message: "Proxy check started via API" });

    return { ok: true, message: "Check queued" };
  });

  app.delete<{ Params: { id: string } }>(
    "/proxies/:id",
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const id = Number(request.params.id);
      await db.proxy.delete({ where: { id } }).catch(() => null);

      return { ok: true };
    },
  );

  app.post("/proxies/clean", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const removed = await removeDead();
    audit({ userId: request.user.id, type: "proxy_cleaned", level: "INFO", message: `API: removed ${removed} dead proxies` });

    return { ok: true, removed };
  });
}

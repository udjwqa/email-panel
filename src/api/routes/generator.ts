import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { emailQueue } from "../../services/queue.js";
import { generateEmails } from "../../services/generator/engine.js";
import { authenticate } from "../middleware/auth.js";
import { audit } from "../../services/audit.js";

export async function generatorRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{
    Body: {
      country: string;
      firstName: string;
      lastName: string;
      city?: string;
      birthYear?: string;
      domains: string[];
      templates: string[];
      count?: number;
      sendToQueue?: boolean;
    };
  }>("/generator/run", async (request, reply) => {
    const { firstName, lastName, domains, templates } = request.body ?? {};

    if (!firstName || !lastName || !domains?.length || !templates?.length) {
      return reply.code(400).send({ error: "firstName, lastName, domains, templates required" });
    }

    const result = generateEmails({
      step: null,
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      city: request.body.city,
      birthYear: request.body.birthYear,
      domains: request.body.domains,
      templates: request.body.templates,
      count: request.body.count ?? 50,
    });

    const sendToQueue = request.body.sendToQueue ?? false;

    const task = await db.task.create({
      data: {
        userId: request.user.id,
        fileName: `gen_${request.body.country ?? "XX"}_${Date.now()}.txt`,
        status: sendToQueue ? "QUEUED" : "CREATED",
        totalRows: result.emails.length,
        validCount: result.emails.length,
      },
    });

    const BATCH = 1000;
    for (let i = 0; i < result.emails.length; i += BATCH) {
      const batch = result.emails.slice(i, i + BATCH);
      await db.email.createMany({
        data: batch.map((e) => ({
          taskId: task.id,
          email: e,
          domain: e.split("@")[1],
          status: "VALID_FORMAT" as const,
        })),
      });
    }

    if (sendToQueue) {
      await emailQueue.add("validate", { taskId: task.id }, { jobId: `task-${task.id}` });
    }

    audit({ userId: request.user.id, type: "generator_saved", level: "INFO", message: `Generated task #${task.id}: ${result.emails.length} emails via API` });

    return { task, generated: result.totalGenerated, duplicatesRemoved: result.duplicatesRemoved };
  });

  app.get<{ Querystring: { page?: string; limit?: string } }>(
    "/generator/history",
    async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));

      const [tasks, total] = await Promise.all([
        db.task.findMany({
          where: { userId: request.user.id, fileName: { startsWith: "gen_" } },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.task.count({
          where: { userId: request.user.id, fileName: { startsWith: "gen_" } },
        }),
      ]);

      return { tasks, total, page, limit };
    },
  );
}

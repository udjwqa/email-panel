import { FastifyInstance } from "fastify";
import { Prisma, EmailStatus } from "@prisma/client";
import { db } from "../../services/db.js";
import { authenticate } from "../middleware/auth.js";

const VALID_STATUSES = Object.values(EmailStatus);

export async function resultRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{
    Querystring: {
      taskId?: string;
      status?: string;
      domain?: string;
      page?: string;
      limit?: string;
    };
  }>("/results", async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));

    const where: Prisma.EmailWhereInput = {
      task: { userId: request.user.id },
    };
    if (request.query.taskId) where.taskId = Number(request.query.taskId);
    if (request.query.status && VALID_STATUSES.includes(request.query.status as EmailStatus)) {
      where.status = request.query.status as EmailStatus;
    }
    if (request.query.domain) where.domain = request.query.domain;

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.email.count({ where }),
    ]);

    return { emails, total, page, limit, pages: Math.ceil(total / limit) };
  });

  app.get<{ Params: { id: string } }>(
    "/results/:id",
    async (request, reply) => {
      const email = await db.email.findUnique({
        where: { id: Number(request.params.id) },
        include: { task: { select: { userId: true } } },
      });

      if (!email || email.task.userId !== request.user.id) {
        return reply.code(404).send({ error: "Not found" });
      }

      const { task: _, ...data } = email;
      return data;
    },
  );
}

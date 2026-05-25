import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { emailQueue } from "../../services/queue.js";
import { authenticate } from "../middleware/auth.js";
import { audit } from "../../services/audit.js";

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get<{ Querystring: { page?: string; limit?: string } }>(
    "/tasks",
    async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));

      const [tasks, total] = await Promise.all([
        db.task.findMany({
          where: { userId: request.user.id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.task.count({ where: { userId: request.user.id } }),
      ]);

      return { tasks, total, page, limit, pages: Math.ceil(total / limit) };
    },
  );

  app.get<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const task = await db.task.findUnique({
      where: { id: Number(request.params.id) },
    });

    if (!task || task.userId !== request.user.id) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return task;
  });

  app.post<{ Params: { id: string } }>(
    "/tasks/:id/start",
    async (request, reply) => {
      const taskId = Number(request.params.id);
      const task = await db.task.findUnique({ where: { id: taskId } });

      if (!task || task.userId !== request.user.id) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (task.status !== "CREATED") {
        return reply.code(400).send({ error: "Task cannot be started" });
      }

      await db.task.update({ where: { id: taskId }, data: { status: "QUEUED" } });
      await emailQueue.add("validate", { taskId }, { jobId: `task-${taskId}` });
      audit({ userId: request.user.id, type: "task_started", level: "INFO", message: `Task #${taskId} started via API` });

      return { ok: true, status: "QUEUED" };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/tasks/:id/pause",
    async (request, reply) => {
      const taskId = Number(request.params.id);
      const task = await db.task.findUnique({ where: { id: taskId } });

      if (!task || task.userId !== request.user.id) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (task.status !== "PROCESSING") {
        return reply.code(400).send({ error: "Task is not processing" });
      }

      await db.task.update({ where: { id: taskId }, data: { status: "PAUSED" } });
      audit({ userId: request.user.id, type: "task_paused", level: "INFO", message: `Task #${taskId} paused via API` });

      return { ok: true, status: "PAUSED" };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/tasks/:id/resume",
    async (request, reply) => {
      const taskId = Number(request.params.id);
      const task = await db.task.findUnique({ where: { id: taskId } });

      if (!task || task.userId !== request.user.id) {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (task.status !== "PAUSED") {
        return reply.code(400).send({ error: "Task is not paused" });
      }

      await db.task.update({ where: { id: taskId }, data: { status: "QUEUED" } });
      await emailQueue.add("validate", { taskId }, { jobId: `task-${taskId}-resume-${Date.now()}` });
      audit({ userId: request.user.id, type: "task_resumed", level: "INFO", message: `Task #${taskId} resumed via API` });

      return { ok: true, status: "QUEUED" };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/tasks/:id/cancel",
    async (request, reply) => {
      const taskId = Number(request.params.id);
      const task = await db.task.findUnique({ where: { id: taskId } });

      if (!task || task.userId !== request.user.id) {
        return reply.code(404).send({ error: "Task not found" });
      }

      await db.task.update({ where: { id: taskId }, data: { status: "CANCELLED" } });
      audit({ userId: request.user.id, type: "task_cancelled", level: "WARNING", message: `Task #${taskId} cancelled via API` });

      return { ok: true, status: "CANCELLED" };
    },
  );
}

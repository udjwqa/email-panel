import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { db } from "../../services/db.js";
import { authenticate } from "../middleware/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>(
    "/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { email, password } = request.body ?? {};

      if (!email || !password) {
        return reply.code(400).send({ error: "Email and password required" });
      }

      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const token = app.jwt.sign(
        { id: user.id, role: user.role, isAdmin: user.isAdmin },
        { expiresIn: "7d" },
      );

      return { token, user: { id: user.id, email: user.email, role: user.role } };
    },
  );

  app.post("/auth/refresh", { onRequest: [authenticate] }, async (request) => {
    const token = request.server.jwt.sign(
      { id: request.user.id, role: request.user.role, isAdmin: request.user.isAdmin },
      { expiresIn: "7d" },
    );
    return { token };
  });

  app.post("/auth/logout", async () => {
    return { ok: true };
  });

  app.get("/me", { onRequest: [authenticate] }, async (request) => {
    const user = await db.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        telegramId: true,
        username: true,
        email: true,
        role: true,
        isAdmin: true,
        createdAt: true,
      },
    });
    return user;
  });
}

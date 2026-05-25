import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { parsePasswordFile } from "../../services/dictionary/parser.js";
import {
  createDictionary,
  getDictionaries,
  getDictionaryPasswords,
  deleteDictionary,
  searchPassword,
  getDictionaryStats,
} from "../../services/dictionary/manager.js";

export async function dictionaryRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{
    Body: { name: string; category?: string };
  }>("/dictionary/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file provided" });
    }

    const buffer = await file.toBuffer();
    const content = buffer.toString("utf-8");
    const result = parsePasswordFile(content);

    if (result.entries.length === 0) {
      return reply.code(400).send({ error: "No valid passwords found" });
    }

    const name =
      (request.body as any)?.name ??
      file.filename?.replace(".txt", "") ??
      "dictionary";
    const category = (request.body as any)?.category ?? "common";

    const dict = await createDictionary(
      request.user.id,
      name,
      category,
      result.entries,
      file.filename,
    );

    return {
      id: dict.id,
      name: dict.name,
      category: dict.category,
      entryCount: dict.entryCount,
      parsing: {
        totalLines: result.totalLines,
        validLines: result.validLines,
        duplicates: result.duplicateCount,
      },
    };
  });

  app.get("/dictionary", async (request) => {
    return getDictionaries(request.user.id);
  });

  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    "/dictionary/:id",
    async (request) => {
      const page = Number(request.query.page) || 1;
      const limit = Math.min(Number(request.query.limit) || 50, 200);
      return getDictionaryPasswords(Number(request.params.id), page, limit);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/dictionary/:id",
    async (request, reply) => {
      await deleteDictionary(Number(request.params.id));
      return { success: true };
    },
  );

  app.get("/dictionary/stats", async (request) => {
    return getDictionaryStats(request.user.id);
  });

  app.post<{ Body: { password: string } }>(
    "/dictionary/search",
    async (request) => {
      return searchPassword(request.body.password, request.user.id);
    },
  );
}

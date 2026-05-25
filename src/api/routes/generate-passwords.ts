import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import {
  generatePasswordPatterns,
  type PatternInput,
} from "../../services/dictionary/pattern-generator.js";
import { createDictionary } from "../../services/dictionary/manager.js";
import { parsePasswordFile } from "../../services/dictionary/parser.js";

export async function generatePasswordsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post<{ Body: PatternInput }>(
    "/passwords/generate",
    async (request) => {
      const result = generatePasswordPatterns(request.body);
      return { passwords: result.passwords, count: result.templateCount };
    },
  );

  app.post<{
    Body: PatternInput & { dictionaryName?: string };
  }>("/passwords/generate-and-save", async (request) => {
    const result = generatePasswordPatterns(request.body);

    const content = result.passwords.join("\n");
    const parsed = parsePasswordFile(content);

    const name =
      request.body.dictionaryName ??
      `patterns_${request.body.firstName}_${request.body.lastName}`.toLowerCase();

    const dict = await createDictionary(
      request.user.id,
      name,
      "user_specific",
      parsed.entries,
      "pattern-generator",
    );

    return {
      dictionaryId: dict.id,
      name: dict.name,
      count: dict.entryCount,
    };
  });
}

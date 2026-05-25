import { FastifyInstance } from "fastify";
import { db } from "../../services/db.js";
import { parseEmailFile } from "../../services/parser.js";
import { authenticate } from "../middleware/auth.js";
import { audit } from "../../services/audit.js";
import { getNumSetting } from "../../services/settings.js";

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.post("/files/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const fileName = file.filename ?? "upload.txt";
    if (!fileName.toLowerCase().endsWith(".txt")) {
      return reply.code(400).send({ error: "Only .txt files supported" });
    }

    const buffer = await file.toBuffer();
    const maxSize = await getNumSetting("max_file_size");
    if (buffer.length > maxSize) {
      return reply.code(400).send({ error: `File too large (max ${maxSize} bytes)` });
    }

    const content = buffer.toString("utf-8");
    const parseResult = parseEmailFile(content);

    const task = await db.task.create({
      data: {
        userId: request.user.id,
        fileName,
        status: "CREATED",
        totalRows: parseResult.totalLines,
        validCount: parseResult.validLines,
        invalidCount: parseResult.invalidLines,
        duplicateCount: parseResult.duplicateCount,
      },
    });

    const BATCH = 1000;
    for (let i = 0; i < parseResult.entries.length; i += BATCH) {
      const batch = parseResult.entries.slice(i, i + BATCH);
      await db.email.createMany({
        data: batch.map((e) => ({
          taskId: task.id,
          email: e.email,
          password: e.password,
          domain: e.domain,
          status: "VALID_FORMAT" as const,
          source: fileName,
        })),
      });
    }

    audit({ userId: request.user.id, type: "file_uploaded", level: "INFO", message: `${fileName}: ${parseResult.validLines} valid via API` });

    return { task, parseResult: { totalLines: parseResult.totalLines, validLines: parseResult.validLines, invalidLines: parseResult.invalidLines, duplicateCount: parseResult.duplicateCount } };
  });
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { config } from "../config.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { taskRoutes } from "./routes/tasks.js";
import { fileRoutes } from "./routes/files.js";
import { resultRoutes } from "./routes/results.js";
import { generatorRoutes } from "./routes/generator.js";
import { statsRoutes } from "./routes/stats.js";
import { exportRoutes } from "./routes/exports.js";
import { validatedExportRoutes } from "./routes/validated-exports.js";
import { logRoutes } from "./routes/logs.js";
import { settingsRoutes } from "./routes/settings.js";
import { proxyRoutes } from "./routes/proxy.js";
import { auditRoutes } from "./routes/audit.js";
import { invalidCredentialsRoutes } from "./routes/invalid-credentials.js";
import { auditReportRoutes } from "./routes/audit-report.js";
import { dictionaryRoutes } from "./routes/dictionary.js";
import { generatePasswordsRoutes } from "./routes/generate-passwords.js";
import { matchingRoutes } from "./routes/matching.js";
import { recoveredRoutes } from "./routes/recovered.js";

export async function createApi() {
  const app = Fastify({ logger: true });

  await app.register(cors);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(fastifyJwt, { secret: config.jwtSecret });
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(taskRoutes);
      await api.register(fileRoutes);
      await api.register(resultRoutes);
      await api.register(generatorRoutes);
      await api.register(statsRoutes);
      await api.register(exportRoutes);
      await api.register(validatedExportRoutes);
      await api.register(logRoutes);
      await api.register(settingsRoutes);
      await api.register(proxyRoutes);
      await api.register(auditRoutes);
      await api.register(invalidCredentialsRoutes);
      await api.register(auditReportRoutes);
      await api.register(dictionaryRoutes);
      await api.register(generatePasswordsRoutes);
      await api.register(matchingRoutes);
      await api.register(recoveredRoutes);
    },
    { prefix: "/api/v1" },
  );

  await app.listen({ port: config.api.port, host: config.api.host });

  return app;
}

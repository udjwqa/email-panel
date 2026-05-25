import { FastifyInstance } from "fastify";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { getAllSettings, setSetting, SETTING_LABELS } from "../../services/settings.js";
import { audit } from "../../services/audit.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/settings", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const settings = await getAllSettings();
    return { settings, labels: SETTING_LABELS };
  });

  app.put<{ Body: { key: string; value: string } }>(
    "/settings",
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const { key, value } = request.body ?? {};
      if (!key || value === undefined) {
        return reply.code(400).send({ error: "key and value required" });
      }

      await setSetting(key, String(value));
      audit({ userId: request.user.id, type: "setting_changed", level: "INFO", message: `${key} = ${value} (via API)` });

      return { ok: true, key, value };
    },
  );
}

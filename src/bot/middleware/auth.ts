import { NextFunction } from "grammy";
import { db } from "../../services/db.js";
import { BotContext } from "../types.js";
import { audit } from "../../services/audit.js";

export async function authMiddleware(ctx: BotContext, next: NextFunction) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  let user = await db.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        telegramId: BigInt(telegramId),
        username: ctx.from.username ?? null,
        role: "VIEWER",
        isAdmin: false,
      },
    });
    audit({ userId: user.id, type: "user_registered", level: "INFO", message: `New user: @${ctx.from.username ?? telegramId}` });
  }

  if (user.username !== ctx.from.username) {
    user = await db.user.update({
      where: { id: user.id },
      data: { username: ctx.from.username ?? null },
    });
  }

  ctx.dbUser = user;
  await next();
}

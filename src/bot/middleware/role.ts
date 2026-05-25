import { NextFunction } from "grammy";
import { Role } from "@prisma/client";
import { BotContext } from "../types.js";

export function requireRole(...roles: Role[]) {
  return async (ctx: BotContext, next: NextFunction) => {
    if (!ctx.dbUser) {
      await ctx.reply("Авторизация не пройдена.");
      return;
    }

    if (ctx.dbUser.isAdmin || roles.includes(ctx.dbUser.role)) {
      await next();
      return;
    }

    await ctx.reply("Недостаточно прав.");
  };
}

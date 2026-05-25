import { LogLevel } from "@prisma/client";
import { db } from "./db.js";

export function audit(params: {
  userId?: number;
  type: string;
  level: LogLevel;
  message: string;
}): void {
  db.log
    .create({
      data: {
        userId: params.userId ?? null,
        type: params.type,
        level: params.level,
        message: params.message,
      },
    })
    .catch(() => {});
}

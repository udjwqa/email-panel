import { db } from "../db.js";
import { getDomainGroup } from "../domain-groups.js";
import type { RecoveredCredential } from "@prisma/client";
import type { DetectionResult } from "./success-detector.js";

export async function saveRecoveredCredential(
  userId: number,
  email: string,
  password: string,
  detection: DetectionResult,
  method: string,
): Promise<RecoveredCredential> {
  return db.recoveredCredential.upsert({
    where: { userId_email: { userId, email } },
    create: {
      userId,
      email,
      password,
      method,
      accessLevel: detection.accessLevel,
      confidence: detection.confidence,
      imapFolders: detection.imapFolders
        ? JSON.stringify(detection.imapFolders)
        : null,
      hasInbox: detection.hasInbox ?? false,
      messageCount: detection.messageCount ?? null,
      has2fa: detection.has2fa,
      provider: detection.provider ?? getDomainGroup(email.split("@")[1] ?? ""),
      metadata: (detection.metadata as any) ?? undefined,
    },
    update: {
      password,
      method,
      accessLevel: detection.accessLevel,
      confidence: detection.confidence,
      imapFolders: detection.imapFolders
        ? JSON.stringify(detection.imapFolders)
        : null,
      hasInbox: detection.hasInbox ?? false,
      messageCount: detection.messageCount ?? null,
      has2fa: detection.has2fa,
      metadata: (detection.metadata as any) ?? undefined,
      recoveredAt: new Date(),
    },
  });
}

export async function getRecoveredCredentials(
  userId: number,
  filters?: { accessLevel?: string; method?: string },
): Promise<RecoveredCredential[]> {
  const where: any = { userId };
  if (filters?.accessLevel) where.accessLevel = filters.accessLevel;
  if (filters?.method) where.method = filters.method;

  return db.recoveredCredential.findMany({
    where,
    orderBy: { recoveredAt: "desc" },
  });
}

export async function getRecoveryStats(userId: number) {
  const [total, byAccessLevel, byMethod] = await Promise.all([
    db.recoveredCredential.count({ where: { userId } }),
    db.recoveredCredential.groupBy({
      by: ["accessLevel"],
      where: { userId },
      _count: true,
    }),
    db.recoveredCredential.groupBy({
      by: ["method"],
      where: { userId },
      _count: true,
    }),
  ]);

  return {
    total,
    byAccessLevel: Object.fromEntries(
      byAccessLevel.map((s) => [s.accessLevel, s._count]),
    ),
    byMethod: Object.fromEntries(
      byMethod.map((s) => [s.method, s._count]),
    ),
  };
}

export async function deleteRecoveredCredential(
  id: number,
  userId: number,
): Promise<void> {
  await db.recoveredCredential.deleteMany({
    where: { id, userId },
  });
}

export async function exportRecoveredCredentials(
  userId: number,
  format: "csv" | "txt" = "csv",
): Promise<Buffer> {
  const records = await db.recoveredCredential.findMany({
    where: { userId },
    orderBy: { recoveredAt: "desc" },
  });

  if (format === "txt") {
    const lines = records.map((r) => `${r.email}:${r.password}`);
    return Buffer.from(lines.join("\n"), "utf-8");
  }

  const lines = ["email,password,method,access_level,confidence,has_2fa,provider"];
  for (const r of records) {
    lines.push(
      [r.email, r.password, r.method, r.accessLevel, r.confidence, r.has2fa, r.provider ?? ""]
        .map((f) => `"${String(f).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

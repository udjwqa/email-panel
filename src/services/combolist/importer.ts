import { db } from "../db.js";
import { parseComboContent, streamComboFile, type ComboPair } from "./parser.js";

const BATCH_SIZE = 1000;

export interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  totalLines: number;
}

export async function importComboContent(
  userId: number,
  content: string,
  source?: string,
): Promise<ImportResult> {
  const parsed = parseComboContent(content);

  let imported = 0;
  for (let i = 0; i < parsed.pairs.length; i += BATCH_SIZE) {
    const batch = parsed.pairs.slice(i, i + BATCH_SIZE);
    const result = await db.comboEntry.createMany({
      data: batch.map((p) => ({
        userId,
        email: p.email,
        password: p.password,
        source: source ?? null,
        status: "pending",
      })),
      skipDuplicates: true,
    });
    imported += result.count;
  }

  return {
    imported,
    duplicates: parsed.duplicates,
    invalid: parsed.invalidLines,
    totalLines: parsed.totalLines,
  };
}

export async function importComboStream(
  userId: number,
  filePath: string,
  source?: string,
): Promise<ImportResult> {
  let imported = 0;
  let totalLines = 0;
  let batch: Array<{ userId: number; email: string; password: string; source: string | null }> = [];

  for await (const pair of streamComboFile(filePath)) {
    totalLines++;
    batch.push({
      userId,
      email: pair.email,
      password: pair.password,
      source: source ?? null,
    });

    if (batch.length >= BATCH_SIZE) {
      const result = await db.comboEntry.createMany({ data: batch, skipDuplicates: true });
      imported += result.count;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const result = await db.comboEntry.createMany({ data: batch, skipDuplicates: true });
    imported += result.count;
  }

  return { imported, duplicates: 0, invalid: 0, totalLines };
}

export async function getComboStats(userId: number) {
  const [total, byStatus] = await Promise.all([
    db.comboEntry.count({ where: { userId } }),
    db.comboEntry.groupBy({
      by: ["status"],
      where: { userId },
      _count: true,
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  };
}

export async function getPendingCombos(
  userId: number,
  limit: number,
): Promise<Array<{ id: number; email: string; password: string }>> {
  return db.comboEntry.findMany({
    where: { userId, status: "pending" },
    select: { id: true, email: true, password: true },
    take: limit,
    orderBy: { id: "asc" },
  });
}

export async function markComboChecked(
  ids: number[],
  status: "success" | "failed",
): Promise<void> {
  await db.comboEntry.updateMany({
    where: { id: { in: ids } },
    data: { status, checkedAt: new Date() },
  });
}

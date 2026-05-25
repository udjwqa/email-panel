import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { ExportFilters } from "../bot/types.js";

const BATCH_SIZE = 5000;

function dateFromPreset(preset: string): Date | null {
  const now = new Date();
  switch (preset) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function buildWhere(filters: ExportFilters): Prisma.EmailWhereInput {
  const where: Prisma.EmailWhereInput = {};

  if (filters.taskId) {
    where.taskId = filters.taskId;
  }

  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses as any };
  }

  if (filters.domainGroup) {
    where.domainGroup = filters.domainGroup;
  }

  if (filters.datePreset && filters.datePreset !== "all") {
    const since = dateFromPreset(filters.datePreset);
    if (since) {
      where.createdAt = { gte: since };
    }
  }

  return where;
}

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  count: number;
  exportId: number;
}

export async function generateExport(
  userId: number,
  filters: ExportFilters,
): Promise<ExportResult> {
  const where = buildWhere(filters);
  const format = filters.format ?? "txt";

  const lines: string[] = [];

  if (format === "csv") {
    lines.push("email,password,domain,domain_group,status,error_reason");
  }

  const seen = new Set<string>();
  let totalCount = 0;
  let skip = 0;

  while (true) {
    const batch = await db.email.findMany({
      where,
      select: {
        email: true,
        password: true,
        domain: true,
        domainGroup: true,
        status: true,
        errorReason: true,
      },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      if (filters.uniqueOnly) {
        if (seen.has(row.email)) continue;
        seen.add(row.email);
      }

      if (format === "csv") {
        const csvRow = [
          row.email,
          row.password ?? "",
          row.domain,
          row.domainGroup ?? "",
          row.status,
          row.errorReason ?? "",
        ]
          .map((f) => `"${f.replace(/"/g, '""')}"`)
          .join(",");
        lines.push(csvRow);
      } else {
        lines.push(row.password ? `${row.email}:${row.password}` : row.email);
      }

      totalCount++;
    }

    skip += batch.length;
  }

  const content = lines.join("\n");
  const buffer = Buffer.from(content, "utf-8");
  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `export_${timestamp}_${totalCount}.${format}`;

  const exportRecord = await db.export.create({
    data: {
      userId,
      filters: filters as any,
      filePath: fileName,
      status: "completed",
    },
  });

  return {
    buffer,
    fileName,
    count: totalCount,
    exportId: exportRecord.id,
  };
}

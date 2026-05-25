import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { getDomainGroup } from "./domain-groups.js";
import { promises as fs } from "fs";
import path from "path";

const BATCH_SIZE = 5000;
const EXPORTS_DIR = path.join(process.cwd(), "exports");

export interface ValidatedCredentialsFilters {
  accountStatuses?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  protocol?: string;
  uniqueOnly?: boolean;
  format?: "txt" | "csv";
}

export interface ValidatedExportResult {
  filePath: string;
  fileName: string;
  count: number;
  exportId: number;
}

function buildValidatedWhere(
  filters: ValidatedCredentialsFilters,
  userId?: number,
): Prisma.AuthResultWhereInput {
  const where: Prisma.AuthResultWhereInput = {};

  // Default to active_clean and active_with_2fa
  const statuses = filters.accountStatuses ?? ["active_clean", "active_with_2fa"];
  where.accountStatus = { in: statuses };

  if (filters.protocol) {
    where.protocol = filters.protocol;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.checkedAt = {};
    if (filters.dateFrom) where.checkedAt.gte = filters.dateFrom;
    if (filters.dateTo) where.checkedAt.lte = filters.dateTo;
  }

  if (userId) {
    where.userId = userId;
  }

  return where;
}

function extractProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "Unknown";
  return getDomainGroup(domain);
}

async function ensureExportsDir(): Promise<void> {
  try {
    await fs.access(EXPORTS_DIR);
  } catch {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
  }
}

export async function generateValidatedExport(
  userId: number,
  filters: ValidatedCredentialsFilters = {},
): Promise<ValidatedExportResult> {
  const where = buildValidatedWhere(filters, userId);
  const format = filters.format ?? "csv";

  const lines: string[] = [];
  if (format === "csv") {
    lines.push("email,password,status,provider");
  }

  const seen = new Set<string>();
  let totalCount = 0;
  let skip = 0;

  while (true) {
    const batch = await db.authResult.findMany({
      where,
      select: { email: true, password: true, accountStatus: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      if (filters.uniqueOnly && seen.has(row.email)) continue;
      if (filters.uniqueOnly) seen.add(row.email);

      const provider = extractProvider(row.email);

      if (format === "csv") {
        const csvRow = [
          row.email,
          row.password ?? "",
          row.accountStatus ?? "",
          provider,
        ]
          .map((f) => `"${String(f).replace(/"/g, '""')}"`)
          .join(",");
        lines.push(csvRow);
      } else {
        // TXT format: email:password
        lines.push(row.password ? `${row.email}:${row.password}` : row.email);
      }

      totalCount++;
    }

    skip += batch.length;
  }

  // Write to disk
  const content = lines.join("\n");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `validated_${timestamp}.${format}`;
  const filePath = path.join(EXPORTS_DIR, fileName);

  await ensureExportsDir();
  await fs.writeFile(filePath, content, "utf-8");

  // Save export record
  const exportRecord = await db.export.create({
    data: {
      userId,
      filters: filters as any,
      filePath,
      status: "completed",
    },
  });

  return {
    filePath,
    fileName,
    count: totalCount,
    exportId: exportRecord.id,
  };
}

export async function getValidatedExportFile(
  filePath: string,
): Promise<Buffer> {
  return fs.readFile(filePath);
}

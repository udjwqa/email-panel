import { db } from "../db.js";
import { audit } from "../audit.js";

export interface ArchivalOptions {
  olderThanDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  statuses?: string[];
}

export interface ArchivalResult {
  archived: number;
  deleted: number;
  errors: number;
  duration: number;
}

export async function archiveInvalidCredentials(
  options: ArchivalOptions = {},
  userId?: number,
): Promise<ArchivalResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize ?? 1000;
  const olderThanDays = options.olderThanDays ?? 30;
  const statuses = options.statuses ?? [
    "auth_failed",
    "account_not_found",
    "permanently_locked",
  ];
  const dryRun = options.dryRun ?? false;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let archived = 0;
  let deleted = 0;
  let errors = 0;

  while (true) {
    const batch = await db.authResult.findMany({
      where: {
        status: { in: statuses },
        checkedAt: { lte: cutoffDate },
      },
      take: batchSize,
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    if (dryRun) {
      archived += batch.length;
      continue;
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.invalidCredential.createMany({
          data: batch.map((record) => ({
            originalId: record.id,
            email: record.email,
            password: record.password,
            protocol: record.protocol,
            host: record.host,
            port: record.port,
            status: record.status,
            errorMessage: record.errorMessage,
            responseTime: record.responseTime,
            originalCheckedAt: record.checkedAt,
            archivedBy: userId ?? null,
            accountStatus: record.accountStatus,
            accountStatusReason: record.accountStatusReason,
          })),
        });

        await tx.authResult.deleteMany({
          where: { id: { in: batch.map((r) => r.id) } },
        });

        archived += batch.length;
        deleted += batch.length;
      });
    } catch (error) {
      console.error("Archival batch error:", error);
      errors += batch.length;
    }
  }

  const duration = Date.now() - startTime;

  if (!dryRun && (archived > 0 || errors > 0)) {
    audit({
      type: "invalid_credentials_archived",
      level: archived > 0 ? "INFO" : "WARNING",
      message: `Archived ${archived} invalid credentials (${deleted} deleted, ${errors} errors) in ${duration}ms`,
      userId: userId ?? undefined,
    });
  }

  return { archived, deleted, errors, duration };
}

export async function restoreFromArchive(
  archiveIds: number[],
  userId?: number,
): Promise<number> {
  let restored = 0;

  await db.$transaction(async (tx) => {
    const records = await tx.invalidCredential.findMany({
      where: { id: { in: archiveIds } },
    });

    await tx.authResult.createMany({
      data: records.map((r) => ({
        email: r.email,
        password: r.password,
        protocol: r.protocol,
        host: r.host,
        port: r.port,
        status: r.status,
        errorMessage: r.errorMessage,
        responseTime: r.responseTime,
        checkedAt: r.originalCheckedAt,
        userId: r.archivedBy,
        accountStatus: r.accountStatus,
        accountStatusReason: r.accountStatusReason,
      })),
    });

    await tx.invalidCredential.deleteMany({
      where: { id: { in: archiveIds } },
    });

    restored = records.length;
  });

  audit({
    type: "invalid_credentials_restored",
    level: "INFO",
    message: `Restored ${restored} credentials from archive`,
    userId: userId ?? undefined,
  });

  return restored;
}

export async function getArchivalStats() {
  const [totalArchived, byStatus, oldestRecord, newestRecord] =
    await Promise.all([
      db.invalidCredential.count(),
      db.invalidCredential.groupBy({
        by: ["status"],
        _count: true,
      }),
      db.invalidCredential.findFirst({
        orderBy: { archivedAt: "asc" },
        select: { archivedAt: true },
      }),
      db.invalidCredential.findFirst({
        orderBy: { archivedAt: "desc" },
        select: { archivedAt: true },
      }),
    ]);

  return {
    totalArchived,
    byStatus: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count]),
    ),
    oldestRecord: oldestRecord?.archivedAt ?? null,
    newestRecord: newestRecord?.archivedAt ?? null,
  };
}

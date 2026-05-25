import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { getDomainGroup } from "../domain-groups.js";
import type {
  AuditReport,
  AuditReportFilters,
  ProviderBreakdown,
} from "./types.js";

const PROVIDER_BATCH_SIZE = 5000;

function buildWhere(
  filters: AuditReportFilters,
): Prisma.AuthResultWhereInput {
  const where: Prisma.AuthResultWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    where.checkedAt = {};
    if (filters.dateFrom) where.checkedAt.gte = filters.dateFrom;
    if (filters.dateTo) where.checkedAt.lte = filters.dateTo;
  }

  if (filters.protocol) {
    where.protocol = filters.protocol;
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  return where;
}

function buildPeriodLabel(filters: AuditReportFilters): string {
  if (filters.dateFrom && filters.dateTo) {
    return `${filters.dateFrom.toISOString().slice(0, 10)} — ${filters.dateTo.toISOString().slice(0, 10)}`;
  }
  if (filters.dateFrom) {
    return `с ${filters.dateFrom.toISOString().slice(0, 10)}`;
  }
  if (filters.dateTo) {
    return `до ${filters.dateTo.toISOString().slice(0, 10)}`;
  }
  return "all time";
}

async function computeProviderBreakdown(
  where: Prisma.AuthResultWhereInput,
): Promise<ProviderBreakdown[]> {
  const providerMap = new Map<string, { total: number; success: number }>();
  let skip = 0;

  while (true) {
    const batch = await db.authResult.findMany({
      where,
      select: { email: true, status: true },
      skip,
      take: PROVIDER_BATCH_SIZE,
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const domain = row.email.split("@")[1]?.toLowerCase() ?? "";
      const provider = getDomainGroup(domain);
      const entry = providerMap.get(provider) ?? { total: 0, success: 0 };
      entry.total++;
      if (row.status === "success") entry.success++;
      providerMap.set(provider, entry);
    }

    skip += batch.length;
    if (batch.length < PROVIDER_BATCH_SIZE) break;
  }

  return Array.from(providerMap.entries())
    .map(([provider, { total, success }]) => ({
      provider,
      total,
      successful: success,
      failed: total - success,
      successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function generateAuditReport(
  filters: AuditReportFilters = {},
): Promise<AuditReport> {
  const where = buildWhere(filters);

  const [
    statusGroups,
    protocolGroups,
    accountStatusGroups,
    avgResponseTime,
    avgByProtocol,
  ] = await Promise.all([
    db.authResult.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    db.authResult.groupBy({
      by: ["protocol"],
      where,
      _count: true,
    }),
    db.authResult.groupBy({
      by: ["accountStatus"],
      where: { ...where, accountStatus: { not: null } },
      _count: true,
    }),
    db.authResult.aggregate({
      where: { ...where, responseTime: { not: null } },
      _avg: { responseTime: true },
    }),
    db.authResult.groupBy({
      by: ["protocol"],
      where: { ...where, responseTime: { not: null } },
      _avg: { responseTime: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  let totalTested = 0;
  for (const g of statusGroups) {
    byStatus[g.status] = g._count;
    totalTested += g._count;
  }

  const totalSuccess = byStatus["success"] ?? 0;
  const totalFailed = totalTested - totalSuccess;
  const successRate =
    totalTested > 0
      ? Math.round((totalSuccess / totalTested) * 1000) / 10
      : 0;

  const twoFaCount = byStatus["2fa_required"] ?? 0;
  const lockedCount = byStatus["permanently_locked"] ?? 0;
  const notFoundCount = byStatus["account_not_found"] ?? 0;

  const twoFaRate =
    totalTested > 0
      ? Math.round((twoFaCount / totalTested) * 1000) / 10
      : 0;
  const lockedRate =
    totalTested > 0
      ? Math.round((lockedCount / totalTested) * 1000) / 10
      : 0;
  const accountNotFoundRate =
    totalTested > 0
      ? Math.round((notFoundCount / totalTested) * 1000) / 10
      : 0;

  const byProtocol: Record<string, number> = {};
  for (const g of protocolGroups) {
    byProtocol[g.protocol] = g._count;
  }

  const byAccountStatus: Record<string, number> = {};
  for (const g of accountStatusGroups) {
    if (g.accountStatus) {
      byAccountStatus[g.accountStatus] = g._count;
    }
  }

  const averageResponseTimeByProtocol: Record<string, number> = {};
  for (const g of avgByProtocol) {
    averageResponseTimeByProtocol[g.protocol] = Math.round(
      g._avg.responseTime ?? 0,
    );
  }

  const byProvider = await computeProviderBreakdown(where);

  return {
    totalTested,
    totalSuccess,
    totalFailed,
    successRate,
    byProvider,
    twoFaRate,
    lockedRate,
    accountNotFoundRate,
    averageResponseTime: Math.round(
      avgResponseTime._avg.responseTime ?? 0,
    ),
    averageResponseTimeByProtocol,
    byStatus,
    byProtocol,
    byAccountStatus,
    generatedAt: new Date(),
    filters,
    period: buildPeriodLabel(filters),
  };
}

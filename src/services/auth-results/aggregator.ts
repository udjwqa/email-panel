import { db } from "../db.js";
import { Prisma } from "@prisma/client";
import type {
  AuthResultFilters,
  AuthResultStats,
  AuthResultRecord,
} from "./types.js";

export async function saveAuthResult(
  data: Omit<AuthResultRecord, "id" | "checkedAt">,
): Promise<AuthResultRecord> {
  return db.authResult.create({
    data: {
      ...data,
      checkedAt: new Date(),
    },
  }) as any as AuthResultRecord;
}

export function buildAuthResultWhere(
  filters: AuthResultFilters,
): Prisma.AuthResultWhereInput {
  const where: Prisma.AuthResultWhereInput = {};

  if (filters.email) {
    where.email = { contains: filters.email };
  }

  if (filters.protocol) {
    where.protocol = filters.protocol;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.accountStatus) {
    where.accountStatus = filters.accountStatus;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.checkedAt = {};
    if (filters.dateFrom) where.checkedAt.gte = filters.dateFrom;
    if (filters.dateTo) where.checkedAt.lte = filters.dateTo;
  }

  if (filters.userId !== undefined) {
    where.userId = filters.userId;
  }

  return where;
}

export async function getAuthResults(
  filters: AuthResultFilters,
  page = 1,
  limit = 50,
): Promise<{
  results: AuthResultRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const where = buildAuthResultWhere(filters);
  const skip = (page - 1) * limit;

  const [results, total] = await Promise.all([
    db.authResult.findMany({
      where,
      orderBy: { checkedAt: "desc" },
      skip,
      take: limit,
    }),
    db.authResult.count({ where }),
  ]);

  return {
    results: results as any as AuthResultRecord[],
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export async function getAuthResultStats(
  filters: AuthResultFilters,
): Promise<AuthResultStats> {
  const where = buildAuthResultWhere(filters);

  const [total, byProtocol, byStatus, avgResponseTime] = await Promise.all([
    db.authResult.count({ where }),
    db.authResult.groupBy({
      by: ["protocol"],
      where,
      _count: true,
    }),
    db.authResult.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    db.authResult.aggregate({
      where: {
        ...where,
        responseTime: { not: null },
      },
      _avg: { responseTime: true },
    }),
  ]);

  return {
    total,
    byProtocol: Object.fromEntries(
      byProtocol.map((p) => [p.protocol, p._count]),
    ) as Record<string, number>,
    byStatus: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count]),
    ) as Record<string, number>,
    averageResponseTime: avgResponseTime._avg.responseTime,
  };
}

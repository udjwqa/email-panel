import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveAuthResult,
  buildAuthResultWhere,
  getAuthResults,
  getAuthResultStats,
} from "../../src/services/auth-results/aggregator.js";

const {
  mockCreate,
  mockFindMany,
  mockCount,
  mockGroupBy,
  mockAggregate,
  mockPrisma,
} = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockFindMany = vi.fn();
  const mockCount = vi.fn();
  const mockGroupBy = vi.fn();
  const mockAggregate = vi.fn();

  const mockPrisma = {
    authResult: {
      create: mockCreate,
      findMany: mockFindMany,
      count: mockCount,
      groupBy: mockGroupBy,
      aggregate: mockAggregate,
    },
  };

  return {
    mockCreate,
    mockFindMany,
    mockCount,
    mockGroupBy,
    mockAggregate,
    mockPrisma,
  };
});

vi.mock("../../src/services/db.js", () => ({
  db: mockPrisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth-results aggregator", () => {
  describe("saveAuthResult", () => {
    it("creates auth result with timestamp", async () => {
      mockCreate.mockResolvedValue({ id: 1 });

      await saveAuthResult({
        email: "test@example.com",
        password: "pass123",
        protocol: "IMAP",
        host: "imap.example.com",
        port: 993,
        status: "success",
        errorMessage: null,
        responseTime: 150,
        userId: null,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "test@example.com",
            protocol: "IMAP",
            status: "success",
          }),
        }),
      );
    });
  });

  describe("buildAuthResultWhere", () => {
    it("builds where clause with email filter", () => {
      const where = buildAuthResultWhere({ email: "test@" });
      expect(where.email).toEqual({ contains: "test@" });
    });

    it("builds where clause with protocol filter", () => {
      const where = buildAuthResultWhere({ protocol: "POP3" });
      expect(where.protocol).toBe("POP3");
    });

    it("builds where clause with date range", () => {
      const from = new Date("2024-01-01");
      const to = new Date("2024-12-31");
      const where = buildAuthResultWhere({ dateFrom: from, dateTo: to });

      expect(where.checkedAt).toEqual({ gte: from, lte: to });
    });
  });

  describe("getAuthResults", () => {
    it("returns paginated results", async () => {
      mockFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockCount.mockResolvedValue(10);

      const result = await getAuthResults({}, 1, 5);

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.pages).toBe(2);
    });
  });

  describe("getAuthResultStats", () => {
    it("aggregates statistics", async () => {
      mockCount.mockResolvedValue(100);
      mockGroupBy
        .mockResolvedValueOnce([
          { protocol: "IMAP", _count: 60 },
          { protocol: "POP3", _count: 40 },
        ])
        .mockResolvedValueOnce([
          { status: "success", _count: 70 },
          { status: "auth_failed", _count: 30 },
        ]);
      mockAggregate.mockResolvedValue({ _avg: { responseTime: 250 } });

      const stats = await getAuthResultStats({});

      expect(stats.total).toBe(100);
      expect(stats.byProtocol.IMAP).toBe(60);
      expect(stats.byStatus.success).toBe(70);
      expect(stats.averageResponseTime).toBe(250);
    });
  });
});

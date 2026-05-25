import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import {
  getAuthResults,
  getAuthResultStats,
} from "../../services/auth-results/aggregator.js";
import type {
  AuthResultFilters,
  AuthProtocol,
  AuthStatus,
} from "../../services/auth-results/types.js";

const VALID_PROTOCOLS: AuthProtocol[] = ["IMAP", "POP3", "SMTP"];
const VALID_STATUSES: AuthStatus[] = [
  "success",
  "auth_failed",
  "connection_error",
  "timeout",
  "2fa_required",
  "captcha_required",
  "verification_required",
  "account_not_found",
  "permanently_locked",
];

function isValidProtocol(value: string): value is AuthProtocol {
  return VALID_PROTOCOLS.includes(value as AuthProtocol);
}

function isValidStatus(value: string): value is AuthStatus {
  return VALID_STATUSES.includes(value as AuthStatus);
}

export async function auditRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // GET /api/v1/audit/results - Filtered results with pagination
  app.get<{
    Querystring: {
      email?: string;
      protocol?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };
  }>("/audit/results", async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));

    const filters: AuthResultFilters = {
      userId: request.user.isAdmin ? undefined : request.user.id,
    };

    if (request.query.email) filters.email = request.query.email;
    if (request.query.protocol && isValidProtocol(request.query.protocol)) {
      filters.protocol = request.query.protocol;
    }
    if (request.query.status && isValidStatus(request.query.status)) {
      filters.status = request.query.status;
    }
    if (request.query.dateFrom)
      filters.dateFrom = new Date(request.query.dateFrom);
    if (request.query.dateTo) filters.dateTo = new Date(request.query.dateTo);

    return getAuthResults(filters, page, limit);
  });

  // GET /api/v1/audit/stats - Aggregated statistics
  app.get<{
    Querystring: {
      email?: string;
      protocol?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }>("/audit/stats", async (request) => {
    const filters: AuthResultFilters = {
      userId: request.user.isAdmin ? undefined : request.user.id,
    };

    if (request.query.email) filters.email = request.query.email;
    if (request.query.protocol && isValidProtocol(request.query.protocol)) {
      filters.protocol = request.query.protocol;
    }
    if (request.query.status && isValidStatus(request.query.status)) {
      filters.status = request.query.status;
    }
    if (request.query.dateFrom)
      filters.dateFrom = new Date(request.query.dateFrom);
    if (request.query.dateTo) filters.dateTo = new Date(request.query.dateTo);

    return getAuthResultStats(filters);
  });
}

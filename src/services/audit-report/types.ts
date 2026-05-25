export interface AuditReportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  protocol?: string;
  userId?: number;
}

export interface ProviderBreakdown {
  provider: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

export interface AuditReport {
  totalTested: number;
  totalSuccess: number;
  totalFailed: number;
  successRate: number;

  byProvider: ProviderBreakdown[];

  twoFaRate: number;
  lockedRate: number;
  accountNotFoundRate: number;

  averageResponseTime: number;
  averageResponseTimeByProtocol: Record<string, number>;

  byStatus: Record<string, number>;
  byProtocol: Record<string, number>;
  byAccountStatus: Record<string, number>;

  generatedAt: Date;
  filters: AuditReportFilters;
  period: string;
}

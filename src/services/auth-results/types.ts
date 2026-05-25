export type AuthProtocol = "IMAP" | "POP3" | "SMTP" | "WEB_AUTH";

export type AuthStatus =
  | "success"
  | "auth_failed"
  | "connection_error"
  | "timeout"
  | "2fa_required"
  | "captcha_required"
  | "verification_required"
  | "account_not_found"
  | "permanently_locked";

export interface AuthResultRecord {
  id: number;
  email: string;
  password: string;
  protocol: AuthProtocol;
  host: string;
  port: number;
  status: AuthStatus;
  errorMessage: string | null;
  responseTime: number | null;
  checkedAt: Date;
  userId: number | null;
  accountStatus: string | null;
  accountStatusReason: string | null;
}

export interface AuthResultFilters {
  email?: string;
  protocol?: AuthProtocol;
  status?: AuthStatus;
  dateFrom?: Date;
  dateTo?: Date;
  userId?: number;
  accountStatus?: string;
}

export interface AuthResultStats {
  total: number;
  byProtocol: Record<AuthProtocol, number>;
  byStatus: Record<AuthStatus, number>;
  averageResponseTime: number | null;
}

export interface SmtpResponse {
  code: number;
  message: string;
  isMultiline: boolean;
  status: SmtpResponseStatus;
}

export type SmtpStatus =
  | "connected"
  | "ehlo_ok"
  | "starttls_ok"
  | "error"
  | "timeout";

export interface SmtpResult {
  status: SmtpStatus;
  banner: string | null;
  ehloResponse: string | null;
  supportsTls: boolean;
  tlsEstablished: boolean;
  responseTime: number;
  error: string | null;
}

export interface MxHost {
  host: string;
  port: number;
  priority: number;
  isFallback: boolean;
}

export type VerifyStatus =
  | "deliverable"
  | "undeliverable"
  | "risky"
  | "unknown"
  | "error"
  | "timeout";

export interface SmtpProxyConfig {
  host: string;
  port: number;
  type: 4 | 5;
  username?: string;
  password?: string;
}

export type SmtpResponseStatus = "success" | "error" | "temporary_failure";

export interface ParsedSmtpResponse {
  code: number;
  message: string;
  status: SmtpResponseStatus;
  isMultiline: boolean;
  lines: string[];
}

export interface VerifyResult {
  email: string;
  status: VerifyStatus;
  mxHost: string | null;
  smtpCode: number | null;
  smtpMessage: string | null;
  responseTime: number;
  error: string | null;
}

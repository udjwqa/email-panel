export interface POP3Config {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export interface POP3AuthResult {
  success: boolean;
  errorType: AuthErrorType | null;
  message?: string;
  responseTime?: number;
}

export type AuthErrorType =
  | "auth_failed"
  | "connection_error"
  | "timeout"
  | "2fa_required"
  | "additional_verification_required";

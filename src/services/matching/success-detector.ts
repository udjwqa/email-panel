import { IMAPVerifier } from "../imap/verifier.js";
import { OAuthClient } from "../oauth/client.js";
import { HttpClient } from "../http/client.js";
import { getImapConfig } from "../imap/host-resolver.js";
import { getDomainGroup } from "../domain-groups.js";

export type AccessLevel = "full_access" | "partial_2fa" | "token_only";

export interface DetectionResult {
  success: boolean;
  accessLevel: AccessLevel;
  confidence: number;
  imapFolders?: string[];
  hasInbox?: boolean;
  messageCount?: number;
  has2fa: boolean;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export class AuthSuccessDetector {
  async detectImap(
    email: string,
    password: string,
    host: string,
    port: number,
  ): Promise<DetectionResult> {
    const verifier = new IMAPVerifier(20_000);

    try {
      const result = await verifier.tryAuthenticateWithStatus(
        { host, port, user: email, password, tls: true },
        3,
      );

      if (!result.success) {
        return { success: false, accessLevel: "full_access", confidence: 0, has2fa: false };
      }

      const accountStatus = result.accountStatus?.status;
      const inboxCheck = result.inboxCheck;

      if (accountStatus === "active_with_2fa") {
        return {
          success: true,
          accessLevel: "partial_2fa",
          confidence: 80,
          has2fa: true,
          hasInbox: inboxCheck?.status === "fully_accessible",
          messageCount: inboxCheck?.totalCount ?? undefined,
          provider: getDomainGroup(email.split("@")[1] ?? ""),
          metadata: { accountStatus, reason: result.accountStatus?.reason },
        };
      }

      if (inboxCheck?.status === "fully_accessible") {
        return {
          success: true,
          accessLevel: "full_access",
          confidence: 100,
          has2fa: false,
          hasInbox: true,
          messageCount: inboxCheck.totalCount ?? undefined,
          provider: getDomainGroup(email.split("@")[1] ?? ""),
          metadata: { accountStatus, unseenCount: inboxCheck.unseenCount },
        };
      }

      return {
        success: true,
        accessLevel: "full_access",
        confidence: 90,
        has2fa: false,
        hasInbox: false,
        provider: getDomainGroup(email.split("@")[1] ?? ""),
        metadata: { accountStatus },
      };
    } catch {
      return { success: false, accessLevel: "full_access", confidence: 0, has2fa: false };
    }
  }

  async detectOAuth(
    email: string,
    password: string,
  ): Promise<DetectionResult> {
    const httpClient = new HttpClient();
    const oauthClient = new OAuthClient(httpClient);

    try {
      const result = await oauthClient.authenticate(null, email, password);

      if (result.success) {
        return {
          success: true,
          accessLevel: "token_only",
          confidence: 90,
          has2fa: false,
          provider: getDomainGroup(email.split("@")[1] ?? ""),
          metadata: { provider: result.provider },
        };
      }

      if (result.error?.toLowerCase().includes("2fa") ||
          result.error?.toLowerCase().includes("two-factor")) {
        return {
          success: true,
          accessLevel: "partial_2fa",
          confidence: 70,
          has2fa: true,
          provider: getDomainGroup(email.split("@")[1] ?? ""),
          metadata: { error: result.error },
        };
      }

      return { success: false, accessLevel: "token_only", confidence: 0, has2fa: false };
    } catch {
      return { success: false, accessLevel: "token_only", confidence: 0, has2fa: false };
    }
  }

  async detect(
    email: string,
    password: string,
    method: "imap" | "oauth",
  ): Promise<DetectionResult> {
    if (method === "oauth") {
      return this.detectOAuth(email, password);
    }

    const imapConfig = getImapConfig(email);
    if (!imapConfig) {
      return this.detectOAuth(email, password);
    }

    return this.detectImap(email, password, imapConfig.host, imapConfig.port);
  }
}

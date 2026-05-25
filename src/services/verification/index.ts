/**
 * Verification service exports
 */

export { ParallelVerificationController } from "./controller.js";
export type {
  CredentialInput,
  IMAPCredential,
  POP3Credential,
  SMTPCredential,
  WebAuthCredential,
  OAuthCredential,
  VerificationOptions,
  UnifiedVerificationResult,
  VerificationBatchResult,
  StartEvent,
  ProgressEvent,
  ResultEvent,
  ErrorEvent,
  CompleteEvent,
} from "./types.js";

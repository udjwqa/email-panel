import { describe, it, expect } from "vitest";
import type { AccessLevel, DetectionResult } from "../../src/services/matching/success-detector.js";

describe("AuthSuccessDetector types", () => {
  it("defines access levels", () => {
    const levels: AccessLevel[] = ["full_access", "partial_2fa", "token_only"];
    expect(levels).toHaveLength(3);
  });

  it("DetectionResult structure for full_access", () => {
    const result: DetectionResult = {
      success: true,
      accessLevel: "full_access",
      confidence: 100,
      has2fa: false,
      hasInbox: true,
      messageCount: 42,
      imapFolders: ["INBOX", "Sent", "Drafts"],
      provider: "Google",
    };

    expect(result.success).toBe(true);
    expect(result.accessLevel).toBe("full_access");
    expect(result.confidence).toBe(100);
    expect(result.has2fa).toBe(false);
    expect(result.hasInbox).toBe(true);
    expect(result.messageCount).toBe(42);
  });

  it("DetectionResult structure for partial_2fa", () => {
    const result: DetectionResult = {
      success: true,
      accessLevel: "partial_2fa",
      confidence: 80,
      has2fa: true,
      provider: "Microsoft",
    };

    expect(result.accessLevel).toBe("partial_2fa");
    expect(result.has2fa).toBe(true);
    expect(result.confidence).toBe(80);
  });

  it("DetectionResult structure for token_only", () => {
    const result: DetectionResult = {
      success: true,
      accessLevel: "token_only",
      confidence: 90,
      has2fa: false,
      provider: "Yahoo",
    };

    expect(result.accessLevel).toBe("token_only");
    expect(result.confidence).toBe(90);
  });

  it("DetectionResult for failed auth", () => {
    const result: DetectionResult = {
      success: false,
      accessLevel: "full_access",
      confidence: 0,
      has2fa: false,
    };

    expect(result.success).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { formatFileSize, SETTING_LABELS } from "../../src/services/settings.js";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(20 * 1024 * 1024)).toBe("20 MB");
  });
});

describe("SETTING_LABELS", () => {
  it("has labels for all default settings", () => {
    expect(SETTING_LABELS.max_file_size).toBeDefined();
    expect(SETTING_LABELS.max_rows_per_task).toBeDefined();
    expect(SETTING_LABELS.daily_task_limit).toBeDefined();
    expect(SETTING_LABELS.worker_concurrency).toBeDefined();
    expect(SETTING_LABELS.error_threshold).toBeDefined();
    expect(SETTING_LABELS.error_rate_threshold).toBeDefined();
  });
});

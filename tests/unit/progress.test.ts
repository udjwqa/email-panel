import { describe, it, expect } from "vitest";
import {
  renderProgressBar,
  formatStatus,
  formatDate,
} from "../../src/services/progress.js";

describe("renderProgressBar", () => {
  it("shows 0% for no progress", () => {
    expect(renderProgressBar(0, 100)).toBe("░░░░░░░░░░ 0%");
  });

  it("shows 50% correctly", () => {
    expect(renderProgressBar(50, 100)).toBe("▓▓▓▓▓░░░░░ 50%");
  });

  it("shows 100% correctly", () => {
    expect(renderProgressBar(100, 100)).toBe("▓▓▓▓▓▓▓▓▓▓ 100%");
  });

  it("handles 0 total", () => {
    expect(renderProgressBar(0, 0)).toBe("░░░░░░░░░░ 0%");
  });

  it("rounds to nearest 10%", () => {
    expect(renderProgressBar(33, 100)).toBe("▓▓▓░░░░░░░ 33%");
  });

  it("caps at 100%", () => {
    expect(renderProgressBar(150, 100)).toBe("▓▓▓▓▓▓▓▓▓▓ 100%");
  });
});

describe("formatStatus", () => {
  it("formats CREATED", () => {
    expect(formatStatus("CREATED")).toBe("📝 Создана");
  });

  it("formats PROCESSING", () => {
    expect(formatStatus("PROCESSING")).toBe("🔄 В обработке");
  });

  it("formats COMPLETED", () => {
    expect(formatStatus("COMPLETED")).toBe("✅ Завершена");
  });

  it("formats FAILED", () => {
    expect(formatStatus("FAILED")).toBe("❌ Ошибка");
  });

  it("formats CANCELLED", () => {
    expect(formatStatus("CANCELLED")).toBe("🚫 Отменена");
  });

  it("formats PAUSED", () => {
    expect(formatStatus("PAUSED")).toBe("⏸ Приостановлена");
  });

  it("formats QUEUED", () => {
    expect(formatStatus("QUEUED")).toBe("⏳ В очереди");
  });
});

describe("formatDate", () => {
  it("formats date as DD.MM", () => {
    const date = new Date(2026, 4, 23);
    expect(formatDate(date)).toBe("23.05");
  });

  it("pads single digits", () => {
    const date = new Date(2026, 0, 5);
    expect(formatDate(date)).toBe("05.01");
  });
});

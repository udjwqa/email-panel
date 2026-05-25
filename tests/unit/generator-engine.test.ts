import { describe, it, expect } from "vitest";
import { generateEmails } from "../../src/services/generator/engine.js";

describe("generateEmails", () => {
  const baseState = {
    step: null as const,
    firstName: "Max",
    lastName: "Mueller",
    city: "Berlin",
    birthYear: "1995",
    domains: ["gmx.de", "web.de"],
    templates: ["full", "first_sur"],
    count: 50,
  };

  it("generates emails from domains × templates", () => {
    const result = generateEmails(baseState);
    expect(result.emails).toHaveLength(4);
    expect(result.emails).toContain("max.mueller@gmx.de");
    expect(result.emails).toContain("mmueller@gmx.de");
    expect(result.emails).toContain("max.mueller@web.de");
    expect(result.emails).toContain("mmueller@web.de");
  });

  it("groups by domain", () => {
    const result = generateEmails(baseState);
    expect(result.byDomain["gmx.de"]).toHaveLength(2);
    expect(result.byDomain["web.de"]).toHaveLength(2);
  });

  it("respects count limit", () => {
    const result = generateEmails({ ...baseState, count: 2 });
    expect(result.emails).toHaveLength(2);
  });

  it("removes duplicates", () => {
    const result = generateEmails({
      ...baseState,
      templates: ["full", "full"],
    });
    expect(result.emails).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(2);
  });

  it("handles empty domains", () => {
    const result = generateEmails({ ...baseState, domains: [] });
    expect(result.emails).toHaveLength(0);
  });

  it("handles empty templates", () => {
    const result = generateEmails({ ...baseState, templates: [] });
    expect(result.emails).toHaveLength(0);
  });
});

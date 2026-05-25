import { WizardState } from "../../bot/types.js";
import { applyTemplate } from "./templates.js";

export interface GenerationResult {
  emails: string[];
  byDomain: Record<string, string[]>;
  totalGenerated: number;
  duplicatesRemoved: number;
}

export function generateEmails(state: WizardState): GenerationResult {
  const {
    firstName = "",
    lastName = "",
    city,
    birthYear,
    domains = [],
    templates = [],
    count = 50,
  } = state;

  const seen = new Set<string>();
  const all: string[] = [];

  for (const domain of domains) {
    for (const tplId of templates) {
      const email = applyTemplate(
        tplId,
        { firstName, lastName, city, birthYear },
        domain,
      );

      if (!seen.has(email)) {
        seen.add(email);
        all.push(email);
      }
    }
  }

  const duplicatesRemoved = domains.length * templates.length - all.length;
  const limited = all.slice(0, count);

  const byDomain: Record<string, string[]> = {};
  for (const email of limited) {
    const domain = email.split("@")[1];
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(email);
  }

  return {
    emails: limited,
    byDomain,
    totalGenerated: limited.length,
    duplicatesRemoved,
  };
}

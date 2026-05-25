export interface ParsedPassword {
  password: string;
  length: number;
  hasDigits: boolean;
  hasSpecial: boolean;
  hasUpper: boolean;
}

export interface PasswordParseResult {
  entries: ParsedPassword[];
  totalLines: number;
  validLines: number;
  emptyLines: number;
  duplicateCount: number;
}

const SPECIAL_CHARS = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

function analyzePassword(password: string): ParsedPassword {
  return {
    password,
    length: password.length,
    hasDigits: /\d/.test(password),
    hasSpecial: SPECIAL_CHARS.test(password),
    hasUpper: /[A-Z]/.test(password),
  };
}

export function parsePasswordFile(content: string): PasswordParseResult {
  const lines = content.split("\n");
  const seen = new Set<string>();
  const entries: ParsedPassword[] = [];

  let totalLines = 0;
  let emptyLines = 0;
  let duplicateCount = 0;
  let validLines = 0;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.length === 0) {
      emptyLines++;
      continue;
    }

    totalLines++;

    if (line.length > 128) continue;

    if (seen.has(line)) {
      duplicateCount++;
      continue;
    }

    seen.add(line);
    entries.push(analyzePassword(line));
    validLines++;
  }

  return { entries, totalLines, validLines, emptyLines, duplicateCount };
}

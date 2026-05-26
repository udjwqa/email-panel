import { createReadStream } from "fs";
import { createInterface } from "readline";

export interface ComboPair {
  email: string;
  password: string;
}

export interface ComboParseResult {
  pairs: ComboPair[];
  totalLines: number;
  validPairs: number;
  invalidLines: number;
  duplicates: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseComboLine(line: string): ComboPair | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  for (const sep of [":", ";", "|", "\t", ","]) {
    const idx = trimmed.indexOf(sep);
    if (idx > 0 && idx < trimmed.length - 1) {
      const email = trimmed.slice(0, idx).trim().toLowerCase();
      const password = trimmed.slice(idx + 1).trim();
      if (EMAIL_RE.test(email) && password.length > 0) {
        return { email, password };
      }
    }
  }

  // space separator (last resort)
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx > 0) {
    const email = trimmed.slice(0, spaceIdx).trim().toLowerCase();
    const password = trimmed.slice(spaceIdx + 1).trim();
    if (EMAIL_RE.test(email) && password.length > 0) {
      return { email, password };
    }
  }

  return null;
}

export function parseComboContent(content: string): ComboParseResult {
  const lines = content.split("\n");
  const seen = new Set<string>();
  const pairs: ComboPair[] = [];
  let totalLines = 0;
  let invalidLines = 0;
  let duplicates = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    totalLines++;

    const pair = parseComboLine(line);
    if (!pair) {
      invalidLines++;
      continue;
    }

    const key = `${pair.email}:${pair.password}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }

    seen.add(key);
    pairs.push(pair);
  }

  return { pairs, totalLines, validPairs: pairs.length, invalidLines, duplicates };
}

export async function* streamComboFile(
  filePath: string,
): AsyncGenerator<ComboPair> {
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const pair = parseComboLine(line);
    if (pair) yield pair;
  }
}

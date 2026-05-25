export interface ParsedEntry {
  email: string;
  password: string | null;
  domain: string;
}

export interface ParseResult {
  entries: ParsedEntry[];
  totalLines: number;
  validLines: number;
  invalidLines: number;
  duplicateCount: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseLine(raw: string): { email: string; password: string | null } | null {
  const line = raw.trim();
  if (!line) return null;

  let email: string;
  let password: string | null = null;

  if (line.includes("|")) {
    const parts = line.split("|").map((s) => s.trim());
    email = parts[0];
    password = parts[1] || null;
  } else if (line.includes(";")) {
    const idx = line.indexOf(";");
    email = line.slice(0, idx).trim();
    password = line.slice(idx + 1).trim() || null;
  } else if (line.includes(":")) {
    const idx = line.indexOf(":");
    email = line.slice(0, idx).trim();
    password = line.slice(idx + 1).trim() || null;
  } else if (line.includes(",")) {
    const idx = line.indexOf(",");
    email = line.slice(0, idx).trim();
    password = line.slice(idx + 1).trim() || null;
  } else {
    email = line;
  }

  email = email.toLowerCase().trim();

  if (!EMAIL_REGEX.test(email)) return null;

  return { email, password };
}

export function parseEmailFile(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  let totalLines = 0;
  let invalidLines = 0;
  let duplicateCount = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    totalLines++;

    const parsed = parseLine(raw);
    if (!parsed) {
      invalidLines++;
      continue;
    }

    if (seen.has(parsed.email)) {
      duplicateCount++;
      continue;
    }

    seen.add(parsed.email);
    const domain = parsed.email.split("@")[1];
    entries.push({ email: parsed.email, password: parsed.password, domain });
  }

  return {
    entries,
    totalLines,
    validLines: entries.length,
    invalidLines,
    duplicateCount,
  };
}

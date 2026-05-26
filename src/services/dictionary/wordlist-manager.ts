import { promises as fs } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

const WORDLISTS_DIR = path.join(process.cwd(), "data", "wordlists");

export interface WordlistInfo {
  name: string;
  filename: string;
  url: string;
  description: string;
  estimatedSize: string;
}

export const AVAILABLE_WORDLISTS: WordlistInfo[] = [
  {
    name: "top-shortlist",
    filename: "top-shortlist.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/top-passwords-shortlist.txt",
    description: "Top passwords shortlist (~100)",
    estimatedSize: "1 KB",
  },
  {
    name: "10k-most-common",
    filename: "10k-most-common.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt",
    description: "10,000 most common passwords",
    estimatedSize: "82 KB",
  },
  {
    name: "100k-NCSC",
    filename: "100k-NCSC.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt",
    description: "100K most used passwords (NCSC UK)",
    estimatedSize: "850 KB",
  },
  {
    name: "rockyou-50",
    filename: "rockyou-50.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Leaked-Databases/rockyou-50.txt",
    description: "RockYou top 50% (~7M unique)",
    estimatedSize: "50 MB",
  },
  {
    name: "rockyou-70",
    filename: "rockyou-70.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Leaked-Databases/rockyou-70.txt",
    description: "RockYou top 70% (~10M unique)",
    estimatedSize: "70 MB",
  },
  {
    name: "rockyou-75",
    filename: "rockyou-75.txt",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Leaked-Databases/rockyou-75.txt",
    description: "RockYou top 75% (~59K curated)",
    estimatedSize: "467 KB",
  },
  // Probable-Wordlists (sorted by real frequency)
  {
    name: "probable-top-1575",
    filename: "probable-top-1575.txt",
    url: "https://raw.githubusercontent.com/berzerk0/Probable-Wordlists/master/Real-Passwords/Top1575-probable-v2.txt",
    description: "Probable Wordlists — top 1,575 (by frequency)",
    estimatedSize: "12 KB",
  },
  {
    name: "probable-top-12k",
    filename: "probable-top-12k.txt",
    url: "https://raw.githubusercontent.com/berzerk0/Probable-Wordlists/master/Real-Passwords/Top12Thousand-probable-v2.txt",
    description: "Probable Wordlists — top 12,645 (by frequency)",
    estimatedSize: "100 KB",
  },
  {
    name: "probable-top-304k",
    filename: "probable-top-304k.txt",
    url: "https://raw.githubusercontent.com/berzerk0/Probable-Wordlists/master/Real-Passwords/Top304Thousand-probable-v2.txt",
    description: "Probable Wordlists — top 304K (by frequency)",
    estimatedSize: "2.8 MB",
  },
  // Specialized
  {
    name: "most-used-1M",
    filename: "most-used-passwords.txt",
    url: "https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/passwords/most_used_passwords.txt",
    description: "Most used passwords — 1M entries",
    estimatedSize: "8.5 MB",
  },
  {
    name: "bt4-passwords",
    filename: "bt4-passwords.txt",
    url: "https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/passwords/bt4_passwords.txt",
    description: "BT4 password collection — 1.65M entries",
    estimatedSize: "16 MB",
  },
  {
    name: "default-credentials",
    filename: "default-credentials.csv",
    url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Default-Credentials/default-passwords.csv",
    description: "Default vendor/router passwords — 2.8K",
    estimatedSize: "50 KB",
  },
  // CrackStation (local only — downloaded separately)
  {
    name: "crackstation-human",
    filename: "crackstation-human-only.txt",
    url: "",
    description: "CrackStation Human-Only — 63.9M real passwords (684 MB)",
    estimatedSize: "684 MB",
  },
];

async function ensureDir(): Promise<void> {
  try {
    await fs.access(WORDLISTS_DIR);
  } catch {
    await fs.mkdir(WORDLISTS_DIR, { recursive: true });
  }
}

export async function isDownloaded(name: string): Promise<boolean> {
  const info = AVAILABLE_WORDLISTS.find((w) => w.name === name);
  if (!info) return false;
  try {
    await fs.access(path.join(WORDLISTS_DIR, info.filename));
    return true;
  } catch {
    return false;
  }
}

export async function downloadWordlist(name: string): Promise<{
  success: boolean;
  path?: string;
  lines?: number;
  error?: string;
}> {
  const info = AVAILABLE_WORDLISTS.find((w) => w.name === name);
  if (!info) return { success: false, error: `Unknown wordlist: ${name}` };

  await ensureDir();
  const filePath = path.join(WORDLISTS_DIR, info.filename);

  try {
    const response = await fetch(info.url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const content = await response.text();
    await fs.writeFile(filePath, content, "utf-8");

    const lines = content.split("\n").filter((l) => l.trim().length > 0).length;

    return { success: true, path: filePath, lines };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function downloadAllEssential(): Promise<
  Array<{ name: string; success: boolean; lines?: number; error?: string }>
> {
  const essential = ["top-shortlist", "10k-most-common", "100k-NCSC", "rockyou-75"];
  const results = [];

  for (const name of essential) {
    if (await isDownloaded(name)) {
      const lines = await countLines(name);
      results.push({ name, success: true, lines });
    } else {
      const result = await downloadWordlist(name);
      results.push({ name, success: result.success, lines: result.lines, error: result.error });
    }
  }

  return results;
}

export async function loadWordlist(name: string): Promise<string[]> {
  const info = AVAILABLE_WORDLISTS.find((w) => w.name === name);
  if (!info) return [];

  const filePath = path.join(WORDLISTS_DIR, info.filename);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

export async function* streamWordlist(name: string): AsyncGenerator<string> {
  const info = AVAILABLE_WORDLISTS.find((w) => w.name === name);
  if (!info) return;

  const filePath = path.join(WORDLISTS_DIR, info.filename);

  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length > 0) yield trimmed;
  }
}

export async function countLines(name: string): Promise<number> {
  let count = 0;
  for await (const _ of streamWordlist(name)) {
    count++;
  }
  return count;
}

export async function getWordlistStats(): Promise<
  Array<{ name: string; downloaded: boolean; lines: number; sizeBytes: number }>
> {
  const stats = [];

  for (const info of AVAILABLE_WORDLISTS) {
    const filePath = path.join(WORDLISTS_DIR, info.filename);
    let downloaded = false;
    let lines = 0;
    let sizeBytes = 0;

    try {
      const stat = await fs.stat(filePath);
      downloaded = true;
      sizeBytes = stat.size;
      lines = await countLines(info.name);
    } catch {}

    stats.push({ name: info.name, downloaded, lines, sizeBytes });
  }

  return stats;
}

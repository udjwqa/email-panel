export const USER_AGENTS = [
  "Thunderbird/102.0",
  "Microsoft Outlook 16.0",
  "Apple Mail (16.0)",
  "K-9 Mail/6.0",
  "BlueMail/1.9.8",
  "Spark/3.0",
  "Evolution/3.46",
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getRandomJitter(minMs = 1000, maxMs = 5000): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepWithJitter(
  minMs = 1000,
  maxMs = 5000,
): Promise<void> {
  const delay = getRandomJitter(minMs, maxMs);
  return sleep(delay);
}

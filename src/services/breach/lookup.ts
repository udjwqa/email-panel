import { getSetting } from "../settings.js";

export interface BreachResult {
  source: string;
  password?: string;
  hash?: string;
  username?: string;
}

export class BreachLookup {
  async searchDeHashed(email: string): Promise<BreachResult[]> {
    const apiKey = await getSetting("breach_dehashed_api_key");
    if (!apiKey) return [];

    try {
      const response = await fetch(
        `https://api.dehashed.com/search?query=email:${encodeURIComponent(email)}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`,
          },
        },
      );

      if (!response.ok) return [];

      const data = (await response.json()) as any;
      if (!data.entries) return [];

      return data.entries
        .filter((e: any) => e.password || e.hashed_password)
        .map((e: any) => ({
          source: "dehashed",
          password: e.password ?? undefined,
          hash: e.hashed_password ?? undefined,
          username: e.username ?? undefined,
        }));
    } catch {
      return [];
    }
  }

  async findKnownPasswords(email: string): Promise<string[]> {
    const passwords: string[] = [];

    const dehashed = await this.searchDeHashed(email);
    for (const r of dehashed) {
      if (r.password) passwords.push(r.password);
    }

    return [...new Set(passwords)];
  }
}

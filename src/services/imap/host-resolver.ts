import { getDomainGroup } from "../domain-groups.js";

interface ImapHostConfig {
  host: string;
  port: number;
}

const IMAP_HOSTS: Record<string, ImapHostConfig> = {
  Google: { host: "imap.gmail.com", port: 993 },
  Microsoft: { host: "outlook.office365.com", port: 993 },
  Yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  German: { host: "imap.gmx.net", port: 993 },
  Polish: { host: "imap.wp.pl", port: 993 },
  Asian: { host: "imap.mail.ru", port: 993 },
  Apple: { host: "imap.mail.me.com", port: 993 },
  ProtonMail: { host: "imap.protonmail.ch", port: 993 },
  Zoho: { host: "imap.zoho.com", port: 993 },
  AOL: { host: "imap.aol.com", port: 993 },
  French: { host: "imap.free.fr", port: 993 },
  ISP: { host: "imap.comcast.net", port: 993 },
};

export function getImapConfig(email: string): ImapHostConfig | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const provider = getDomainGroup(domain);
  return IMAP_HOSTS[provider] ?? null;
}

export function getImapProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return getDomainGroup(domain);
}

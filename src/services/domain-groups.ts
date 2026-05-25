const DOMAIN_GROUP_MAP: Record<string, string> = {
  // Microsoft
  "outlook.com": "Microsoft",
  "hotmail.com": "Microsoft",
  "live.com": "Microsoft",
  "msn.com": "Microsoft",
  "outlook.de": "Microsoft",
  "outlook.co.uk": "Microsoft",
  "outlook.fr": "Microsoft",
  "outlook.es": "Microsoft",
  "outlook.it": "Microsoft",
  "hotmail.co.uk": "Microsoft",
  "hotmail.de": "Microsoft",
  "hotmail.fr": "Microsoft",
  "hotmail.it": "Microsoft",
  "hotmail.es": "Microsoft",
  "live.co.uk": "Microsoft",
  "live.de": "Microsoft",
  "live.fr": "Microsoft",

  // Google
  "gmail.com": "Google",
  "googlemail.com": "Google",

  // Yahoo
  "yahoo.com": "Yahoo",
  "yahoo.co.uk": "Yahoo",
  "yahoo.de": "Yahoo",
  "yahoo.fr": "Yahoo",
  "yahoo.it": "Yahoo",
  "yahoo.es": "Yahoo",
  "yahoo.co.jp": "Yahoo",
  "yahoo.co.in": "Yahoo",
  "ymail.com": "Yahoo",
  "rocketmail.com": "Yahoo",

  // German providers
  "gmx.de": "German",
  "gmx.net": "German",
  "gmx.at": "German",
  "gmx.ch": "German",
  "web.de": "German",
  "t-online.de": "German",
  "freenet.de": "German",
  "arcor.de": "German",
  "posteo.de": "German",
  "mailbox.org": "German",
  "1und1.de": "German",

  // Polish providers
  "wp.pl": "Polish",
  "o2.pl": "Polish",
  "onet.pl": "Polish",
  "interia.pl": "Polish",
  "gazeta.pl": "Polish",
  "poczta.fm": "Polish",
  "poczta.onet.pl": "Polish",
  "op.pl": "Polish",

  // Asian providers
  "qq.com": "Asian",
  "163.com": "Asian",
  "126.com": "Asian",
  "naver.com": "Asian",
  "daum.net": "Asian",
  "nifty.com": "Asian",
  "mail.ru": "Asian",
  "yandex.ru": "Asian",
  "yandex.com": "Asian",
  "rambler.ru": "Asian",

  // ISP / cable providers
  "comcast.net": "ISP",
  "verizon.net": "ISP",
  "att.net": "ISP",
  "cox.net": "ISP",
  "charter.net": "ISP",
  "sbcglobal.net": "ISP",
  "bellsouth.net": "ISP",
  "earthlink.net": "ISP",
  "optonline.net": "ISP",
  "frontier.com": "ISP",

  // Other well-known
  "icloud.com": "Apple",
  "me.com": "Apple",
  "mac.com": "Apple",
  "protonmail.com": "ProtonMail",
  "proton.me": "ProtonMail",
  "zoho.com": "Zoho",
  "aol.com": "AOL",

  // French providers
  "orange.fr": "French",
  "laposte.net": "French",
  "sfr.fr": "French",
  "free.fr": "French",
  "wanadoo.fr": "French",

  // Spanish providers
  "telefonica.net": "Spanish",
  "terra.es": "Spanish",
  "ya.com": "Spanish",

  // Brazilian
  "uol.com.br": "Brazilian",
  "bol.com.br": "Brazilian",
  "globo.com": "Brazilian",
};

export function getDomainGroup(domain: string): string {
  return DOMAIN_GROUP_MAP[domain.toLowerCase()] ?? "Unknown";
}

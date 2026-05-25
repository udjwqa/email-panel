export interface CountryData {
  code: string;
  label: string;
  flag: string;
  domains: string[];
}

export const COUNTRIES: CountryData[] = [
  {
    code: "DE",
    label: "Германия",
    flag: "🇩🇪",
    domains: [
      "gmx.de",
      "web.de",
      "t-online.de",
      "outlook.de",
      "gmail.com",
      "hotmail.de",
      "freenet.de",
      "posteo.de",
      "mailbox.org",
      "1und1.de",
    ],
  },
  {
    code: "FR",
    label: "Франция",
    flag: "🇫🇷",
    domains: [
      "outlook.fr",
      "hotmail.fr",
      "gmail.com",
      "yahoo.fr",
      "orange.fr",
      "laposte.net",
      "sfr.fr",
      "free.fr",
    ],
  },
  {
    code: "IT",
    label: "Италия",
    flag: "🇮🇹",
    domains: [
      "outlook.it",
      "hotmail.it",
      "gmail.com",
      "yahoo.it",
      "libero.it",
      "virgilio.it",
      "tiscali.it",
      "alice.it",
    ],
  },
  {
    code: "PL",
    label: "Польша",
    flag: "🇵🇱",
    domains: [
      "wp.pl",
      "o2.pl",
      "onet.pl",
      "interia.pl",
      "gmail.com",
      "gazeta.pl",
      "poczta.fm",
      "op.pl",
    ],
  },
  {
    code: "JP",
    label: "Япония",
    flag: "🇯🇵",
    domains: [
      "yahoo.co.jp",
      "gmail.com",
      "nifty.com",
      "outlook.jp",
      "icloud.com",
      "docomo.ne.jp",
    ],
  },
  {
    code: "US",
    label: "США",
    flag: "🇺🇸",
    domains: [
      "gmail.com",
      "yahoo.com",
      "outlook.com",
      "aol.com",
      "icloud.com",
      "hotmail.com",
      "comcast.net",
      "protonmail.com",
    ],
  },
];

export function getCountry(code: string): CountryData | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

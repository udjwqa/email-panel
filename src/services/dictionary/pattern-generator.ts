export interface PatternInput {
  firstName: string;
  lastName: string;
  birthDate?: string;
  nickname?: string;
  petName?: string;
  phone?: string;
  city?: string;
  customWords?: string[];
}

export interface GeneratedPatterns {
  passwords: string[];
  templateCount: number;
  inputData: PatternInput;
}

const LEET_MAP: Record<string, string> = {
  a: "@",
  e: "3",
  i: "1",
  o: "0",
  s: "$",
  t: "7",
};

const SUFFIXES = ["!", "@", "#", "1", "12", "123", "1234", "!", "!!", "01", "007"];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function leetSpeak(s: string): string {
  return s
    .split("")
    .map((c) => LEET_MAP[c.toLowerCase()] ?? c)
    .join("");
}

function parseBirthDate(date: string): {
  year: string;
  yy: string;
  mm: string;
  dd: string;
} | null {
  const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  return {
    year: parts[1],
    yy: parts[1].slice(2),
    mm: parts[2],
    dd: parts[3],
  };
}

export function generatePasswordPatterns(
  input: PatternInput,
): GeneratedPatterns {
  const results = new Set<string>();
  const fn = input.firstName.trim();
  const ln = input.lastName.trim();

  if (!fn || !ln) {
    return { passwords: [], templateCount: 0, inputData: input };
  }

  const Name = capitalize(fn);
  const name = fn.toLowerCase();
  const Surname = capitalize(ln);
  const surname = ln.toLowerCase();
  const F = Name[0];
  const f = name[0];
  const S = Surname[0];

  const add = (s: string) => {
    if (s.length >= 4) results.add(s);
  };

  // Base name combos
  add(`${Name}${Surname}`);
  add(`${name}${surname}`);
  add(`${Surname}${Name}`);
  add(`${surname}${name}`);
  add(`${name}.${surname}`);
  add(`${name}_${surname}`);
  add(`${surname}.${name}`);
  add(`${Name}${S}`);
  add(`${F}${Surname}`);
  add(`${f}${surname}`);
  add(`${F}${S}`);
  add(`${name}${S}`);

  // With suffixes
  const bases = [Name, name, Surname, surname, `${Name}${Surname}`, `${name}${surname}`];
  for (const base of bases) {
    for (const suf of SUFFIXES) {
      add(`${base}${suf}`);
    }
  }

  // Birth date patterns
  const bd = input.birthDate ? parseBirthDate(input.birthDate) : null;
  if (bd) {
    const dateBases = [Name, name, Surname, surname, `${F}${Surname}`, `${f}${surname}`];
    for (const base of dateBases) {
      add(`${base}${bd.year}`);
      add(`${base}${bd.yy}`);
      add(`${base}${bd.dd}${bd.mm}`);
      add(`${base}${bd.mm}${bd.dd}`);
      add(`${base}${bd.dd}${bd.mm}${bd.yy}`);
      add(`${base}${bd.dd}${bd.mm}${bd.year}`);
    }

    // Year+suffix
    add(`${Name}${bd.year}!`);
    add(`${name}${bd.year}!`);
    add(`${name}${bd.yy}!`);
    add(`${Surname}${bd.year}!`);

    // Initials + year
    add(`${F}${S}${bd.year}`);
    add(`${F}${S}${bd.yy}`);
    add(`${f}${S.toLowerCase()}${bd.year}`);

    // Date only combos
    add(`${bd.dd}${bd.mm}${bd.year}`);
    add(`${bd.mm}${bd.dd}${bd.year}`);
    add(`${bd.year}${bd.mm}${bd.dd}`);
  }

  // Leet speak on top combos
  const leetBases = [name, surname, `${name}${surname}`, `${Name}${Surname}`];
  for (const base of leetBases) {
    const leet = leetSpeak(base);
    if (leet !== base) {
      add(leet);
      if (bd) {
        add(`${leet}${bd.year}`);
        add(`${leet}${bd.yy}`);
      }
      add(`${leet}123`);
      add(`${leet}!`);
    }
  }

  // City-based patterns
  if (input.city) {
    const city = input.city.trim().toLowerCase();
    const City = capitalize(input.city.trim());
    add(city);
    add(City);
    add(`${city}123`);
    add(`${City}!`);
    if (bd) {
      add(`${City}${bd.year}`);
      add(`${city}${bd.year}`);
      add(`${City}${bd.yy}`);
      add(`${city}${bd.yy}`);
    }
    add(`${name}${city}`);
    add(`${Name}${City}`);
    add(`${city}${name}`);
  }

  // Custom words (nickname, pet, phone)
  const extras: string[] = [];
  if (input.nickname) extras.push(input.nickname.trim());
  if (input.petName) extras.push(input.petName.trim());
  if (input.customWords) extras.push(...input.customWords.map((w) => w.trim()));

  for (const word of extras) {
    if (!word) continue;
    const w = word.toLowerCase();
    const W = capitalize(word);
    add(w);
    add(W);
    add(`${w}123`);
    add(`${w}1234`);
    add(`${w}!`);
    add(`${W}!`);
    if (bd) {
      add(`${w}${bd.year}`);
      add(`${W}${bd.year}`);
      add(`${w}${bd.yy}`);
    }
    add(`${name}${w}`);
    add(`${w}${name}`);
    add(`${W}${Name}`);
  }

  // Phone patterns
  if (input.phone) {
    const digits = input.phone.replace(/\D/g, "");
    if (digits.length >= 4) {
      const last4 = digits.slice(-4);
      const last6 = digits.length >= 6 ? digits.slice(-6) : null;
      add(`${Name}${last4}`);
      add(`${name}${last4}`);
      add(`${Surname}${last4}`);
      if (last6) add(`${name}${last6}`);
    }
  }

  const passwords = Array.from(results);

  return {
    passwords,
    templateCount: passwords.length,
    inputData: input,
  };
}

const LEET: Record<string, string> = { a: "@", e: "3", i: "1", o: "0", s: "$", t: "7" };
const YEARS = ["2023", "2024", "2025", "2026"];
const SUFFIXES = ["!", "1", "123", "1!", "!!", "@", "#", "1234"];

export function applyMutations(base: string): string[] {
  const results = new Set<string>();
  const lower = base.toLowerCase();
  const upper = base.toUpperCase();
  const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();

  results.add(lower);
  results.add(upper);
  results.add(cap);

  for (const suf of SUFFIXES) {
    results.add(lower + suf);
    results.add(cap + suf);
  }

  for (const year of YEARS) {
    results.add(lower + year);
    results.add(cap + year);
    results.add(lower + year + "!");
    results.add(cap + year + "!");
    results.add(lower + year.slice(2));
    results.add(cap + year.slice(2));
  }

  // Leet speak
  let leet = lower;
  for (const [from, to] of Object.entries(LEET)) {
    leet = leet.replaceAll(from, to);
  }
  if (leet !== lower) {
    results.add(leet);
    results.add(leet + "1");
    results.add(leet + "!");
  }

  // Reverse
  const rev = lower.split("").reverse().join("");
  if (rev !== lower) results.add(rev);

  // Double
  results.add(lower + lower);

  return Array.from(results).filter((p) => p.length >= 4);
}

export function seasonYearPasswords(): string[] {
  const seasons = ["Spring", "Summer", "Autumn", "Winter", "Frühling", "Sommer", "Herbst"];
  const results: string[] = [];
  for (const season of seasons) {
    for (const year of YEARS) {
      results.push(`${season}${year}`, `${season}${year}!`, `${season.toLowerCase()}${year}`);
    }
  }
  return results;
}

export function keyboardWalks(): string[] {
  return [
    "qwerty", "qwertyuiop", "qwerty123", "qwerty1", "qwerty!",
    "asdfgh", "asdfghjkl", "asdf1234",
    "zxcvbn", "zxcvbnm",
    "1qaz2wsx", "1qaz2wsx3edc", "!QAZ2wsx",
    "zaq12wsx", "zaq1xsw2",
    "1q2w3e4r", "1q2w3e4r5t",
    "q1w2e3r4", "q1w2e3r4t5",
    "1234qwer", "qwer1234",
    "asdfjkl;", "qazwsxedc",
    "poiuytrewq", "mnbvcxz",
    "0987654321", "9876543210",
  ];
}

export function commonMutationPasswords(): string[] {
  const bases = [
    "password", "admin", "login", "welcome", "master",
    "letmein", "monkey", "dragon", "shadow", "sunshine",
    "princess", "football", "baseball", "soccer", "hockey",
    "batman", "superman", "michael", "jennifer", "jessica",
    "iloveyou", "trustno1", "access", "hello", "charlie",
  ];

  const all = new Set<string>();
  for (const base of bases) {
    for (const m of applyMutations(base)) {
      all.add(m);
    }
  }

  for (const p of seasonYearPasswords()) all.add(p);
  for (const p of keyboardWalks()) all.add(p);

  return Array.from(all);
}

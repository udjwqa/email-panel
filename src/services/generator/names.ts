export interface NameDatabase {
  firstNames: string[];
  lastNames: string[];
  cities: string[];
}

export const NAME_DATABASES: Record<string, NameDatabase> = {
  DE: {
    firstNames: [
      "Max", "Hans", "Klaus", "Peter", "Stefan", "Michael", "Thomas",
      "Anna", "Maria", "Julia", "Sophie", "Laura", "Lena", "Katharina",
    ],
    lastNames: [
      "Mueller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer",
      "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter",
    ],
    cities: ["Berlin", "Hamburg", "Muenchen", "Koeln", "Frankfurt", "Stuttgart", "Dresden"],
  },
  FR: {
    firstNames: [
      "Jean", "Pierre", "Louis", "Nicolas", "Antoine", "François",
      "Marie", "Sophie", "Camille", "Julie", "Claire", "Isabelle",
    ],
    lastNames: [
      "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard",
      "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent",
    ],
    cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Bordeaux"],
  },
  IT: {
    firstNames: [
      "Marco", "Luca", "Giuseppe", "Andrea", "Alessandro", "Francesco",
      "Sofia", "Giulia", "Chiara", "Sara", "Valentina", "Francesca",
    ],
    lastNames: [
      "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano",
      "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo",
    ],
    cities: ["Roma", "Milano", "Napoli", "Torino", "Firenze", "Bologna", "Venezia"],
  },
  PL: {
    firstNames: [
      "Jan", "Andrzej", "Piotr", "Krzysztof", "Tomasz", "Marcin",
      "Anna", "Katarzyna", "Agnieszka", "Magdalena", "Monika", "Joanna",
    ],
    lastNames: [
      "Nowak", "Kowalski", "Wisniewski", "Wojcik", "Kowalczyk", "Kaminski",
      "Lewandowski", "Zielinski", "Szymanski", "Wozniak", "Dabrowski", "Kozlowski",
    ],
    cities: ["Warszawa", "Krakow", "Wroclaw", "Poznan", "Gdansk", "Lodz", "Katowice"],
  },
  JP: {
    firstNames: [
      "Takeshi", "Yuki", "Haruto", "Sota", "Ren", "Hiroshi",
      "Sakura", "Yui", "Hana", "Aoi", "Mio", "Rin",
    ],
    lastNames: [
      "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito",
      "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada",
    ],
    cities: ["Tokyo", "Osaka", "Kyoto", "Yokohama", "Nagoya", "Sapporo", "Fukuoka"],
  },
  US: {
    firstNames: [
      "James", "John", "Robert", "Michael", "William", "David",
      "Mary", "Jennifer", "Jessica", "Sarah", "Emily", "Amanda",
    ],
    lastNames: [
      "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
      "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson",
    ],
    cities: ["NewYork", "LosAngeles", "Chicago", "Houston", "Phoenix", "Dallas", "Miami"],
  },
};

export function getNameDatabase(countryCode: string): NameDatabase | undefined {
  return NAME_DATABASES[countryCode];
}

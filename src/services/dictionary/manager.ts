import { db } from "../db.js";
import type { PasswordDictionary, DictionaryPassword } from "@prisma/client";
import type { ParsedPassword } from "./parser.js";

const BATCH_SIZE = 1000;

export async function createDictionary(
  userId: number,
  name: string,
  category: string,
  passwords: ParsedPassword[],
  source?: string,
): Promise<PasswordDictionary> {
  const dictionary = await db.passwordDictionary.create({
    data: {
      userId,
      name,
      category,
      entryCount: 0,
      source: source ?? null,
    },
  });

  let inserted = 0;

  for (let i = 0; i < passwords.length; i += BATCH_SIZE) {
    const batch = passwords.slice(i, i + BATCH_SIZE);
    const result = await db.dictionaryPassword.createMany({
      data: batch.map((p) => ({
        dictionaryId: dictionary.id,
        password: p.password,
        length: p.length,
        hasDigits: p.hasDigits,
        hasSpecial: p.hasSpecial,
        hasUpper: p.hasUpper,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  await db.passwordDictionary.update({
    where: { id: dictionary.id },
    data: { entryCount: inserted },
  });

  return { ...dictionary, entryCount: inserted };
}

export async function getDictionaries(
  userId: number,
): Promise<PasswordDictionary[]> {
  return db.passwordDictionary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDictionaryPasswords(
  dictionaryId: number,
  page = 1,
  limit = 50,
): Promise<{ passwords: DictionaryPassword[]; total: number }> {
  const skip = (page - 1) * limit;

  const [passwords, total] = await Promise.all([
    db.dictionaryPassword.findMany({
      where: { dictionaryId },
      skip,
      take: limit,
      orderBy: { id: "asc" },
    }),
    db.dictionaryPassword.count({ where: { dictionaryId } }),
  ]);

  return { passwords, total };
}

export async function deleteDictionary(dictionaryId: number): Promise<void> {
  await db.passwordDictionary.delete({ where: { id: dictionaryId } });
}

export async function searchPassword(
  password: string,
  userId?: number,
): Promise<{ found: boolean; dictionaries: string[] }> {
  const where: any = { password };
  if (userId) {
    where.dictionary = { userId };
  }

  const results = await db.dictionaryPassword.findMany({
    where,
    include: { dictionary: { select: { name: true, category: true } } },
    take: 10,
  });

  return {
    found: results.length > 0,
    dictionaries: results.map(
      (r) => `${r.dictionary.name} (${r.dictionary.category})`,
    ),
  };
}

export async function getDictionaryStats(userId: number) {
  const [totalDictionaries, byCategory, totalPasswords] = await Promise.all([
    db.passwordDictionary.count({ where: { userId } }),
    db.passwordDictionary.groupBy({
      by: ["category"],
      where: { userId },
      _sum: { entryCount: true },
    }),
    db.passwordDictionary.aggregate({
      where: { userId },
      _sum: { entryCount: true },
    }),
  ]);

  return {
    totalDictionaries,
    totalPasswords: totalPasswords._sum.entryCount ?? 0,
    byCategory: Object.fromEntries(
      byCategory.map((c) => [c.category, c._sum.entryCount ?? 0]),
    ),
  };
}

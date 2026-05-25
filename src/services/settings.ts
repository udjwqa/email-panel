import { db } from "./db.js";

const DEFAULTS: Record<string, string> = {
  max_file_size: "20971520",
  max_rows_per_task: "100000",
  daily_task_limit: "50",
  worker_concurrency: "2",
  error_threshold: "100",
  error_rate_threshold: "20",
  invalid_creds_retention_days: "30",
  invalid_creds_batch_size: "1000",
  invalid_creds_cleanup_enabled: "true",
  matching_delay_ms: "2000",
  matching_jitter_factor: "0.3",
  matching_max_attempts_per_email: "20",
  matching_proxy_rotate_every: "5",
  matching_domain_cooldown_ms: "30000",
  matching_throttle_enabled: "true",
};

export const SETTING_LABELS: Record<string, string> = {
  max_file_size: "Макс. размер файла (байт)",
  max_rows_per_task: "Макс. строк на задачу",
  daily_task_limit: "Задач в день",
  worker_concurrency: "Параллельность воркеров",
  error_threshold: "Порог ошибок (абс.)",
  error_rate_threshold: "Порог ошибок (%)",
  invalid_creds_retention_days: "Дни хранения невалидных (до архивации)",
  invalid_creds_batch_size: "Размер батча архивации",
  invalid_creds_cleanup_enabled: "Автоочистка невалидных вкл.",
  matching_delay_ms: "Задержка между попытками (мс)",
  matching_jitter_factor: "Jitter фактор (0-1)",
  matching_max_attempts_per_email: "Макс. попыток на email",
  matching_proxy_rotate_every: "Ротация proxy каждые N попыток",
  matching_domain_cooldown_ms: "Cooldown домена (мс)",
  matching_throttle_enabled: "Throttle включён",
};

const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL = 60_000;

export async function getSetting(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await db.setting.findUnique({ where: { key } });
  const value = row?.value ?? DEFAULTS[key] ?? "";

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
  return value;
}

export async function getNumSetting(key: string): Promise<number> {
  const val = await getSetting(key);
  return Number(val) || Number(DEFAULTS[key]) || 0;
}

export async function setSetting(
  key: string,
  value: string,
): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const result = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

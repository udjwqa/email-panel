import "dotenv/config";

export const config = {
  botToken: process.env.BOT_TOKEN!,
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Boolean),
  api: {
    port: Number(process.env.API_PORT) || 3000,
    host: process.env.API_HOST || "0.0.0.0",
  },
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return secret || "dev-only-secret";
  })(),
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  upload: {
    maxFileSize: Number(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024,
  },
  notifications: {
    errorThreshold: Number(process.env.ERROR_THRESHOLD) || 100,
    errorRateThreshold: Number(process.env.ERROR_RATE_THRESHOLD) || 20,
  },
};

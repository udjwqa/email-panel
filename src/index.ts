import { createBot } from "./bot/index.js";
import { createApi } from "./api/index.js";
import { db } from "./services/db.js";
import { redisConnection } from "./services/queue.js";
import { startWorkers, stopWorkers } from "./workers/index.js";
import { log, error } from "./utils/logger.js";

async function main() {
  try {
    await db.$connect();
    log("Database connected");

    const bot = createBot();
    const api = await createApi();
    log("API server started");

    await startWorkers();

    await bot.start();
    log("Bot started");

    const shutdown = async () => {
      log("Shutting down...");
      await bot.stop();
      await stopWorkers();
      await api.close();
      await redisConnection.quit();
      await db.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    error("Failed to start", err);
    process.exit(1);
  }
}

main();

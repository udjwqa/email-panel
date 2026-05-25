import IORedis from "ioredis";
import { db } from "../db.js";
import {
  generatePasswordPatterns,
  type PatternInput,
} from "../dictionary/pattern-generator.js";
import { parsePasswordFile } from "../dictionary/parser.js";
import { createDictionary } from "../dictionary/manager.js";
import { CredentialMatchingEngine } from "../matching/engine.js";
import { getRecoveryStats } from "../matching/recovered-credentials.js";
import { ProgressPusher } from "../telegram/progress-pusher.js";
import { renderProgressBar } from "../progress.js";
import { config } from "../../config.js";
import { audit } from "../audit.js";

export interface RecoveryPipelineOptions {
  userId: number;
  taskId?: number;
  emails?: string[];
  dictionaryIds: number[];
  patternInput?: PatternInput;
  method?: "imap" | "oauth";
  chatId?: string;
}

export interface RecoveryPipelineResult {
  stage1: { patternsGenerated: number };
  stage2: { totalPasswords: number; fromDictionaries: number; fromPatterns: number };
  stage3: { emailsTested: number; found: number; notFound: number };
  stage4: { fullAccess: number; partial2fa: number; tokenOnly: number };
  totalRecovered: number;
  duration: number;
}

interface StageStatus {
  status: "pending" | "running" | "completed";
  detail?: string;
}

export interface RecoveryProgress {
  currentStage: number;
  stages: [StageStatus, StageStatus, StageStatus, StageStatus];
}

export class RecoveryPipeline {
  private options: RecoveryPipelineOptions;
  private redis: IORedis;
  private progressKey: string;
  private pusher: ProgressPusher;

  constructor(options: RecoveryPipelineOptions) {
    this.options = options;
    this.redis = new IORedis(config.redis.url);
    this.progressKey = `recovery-pipeline-progress:${options.taskId ?? "direct"}`;
    this.pusher = new ProgressPusher(options.taskId ?? 0, "rpipe");
  }

  async run(): Promise<RecoveryPipelineResult> {
    const startTime = Date.now();
    await this.pusher.init();

    const progress: RecoveryProgress = {
      currentStage: 1,
      stages: [
        { status: "pending" },
        { status: "pending" },
        { status: "pending" },
        { status: "pending" },
      ],
    };

    try {
      // Stage 1: Generate patterns
      progress.stages[0].status = "running";
      await this.saveProgress(progress);

      let patternsGenerated = 0;
      let patternDictId: number | undefined;

      if (this.options.patternInput) {
        const result = generatePasswordPatterns(this.options.patternInput);
        patternsGenerated = result.passwords.length;

        if (patternsGenerated > 0) {
          const parsed = parsePasswordFile(result.passwords.join("\n"));
          const dict = await createDictionary(
            this.options.userId,
            `_pipeline_patterns_${Date.now()}`,
            "user_specific",
            parsed.entries,
            "recovery-pipeline",
          );
          patternDictId = dict.id;
        }
      }

      progress.stages[0].status = "completed";
      progress.stages[0].detail = `${patternsGenerated} patterns`;
      await this.saveProgress(progress);

      await this.pusher.pushStageComplete(
        "Stage 1: Patterns",
        `Generated ${patternsGenerated} passwords`,
      );

      // Stage 2: Merge passwords
      progress.currentStage = 2;
      progress.stages[1].status = "running";
      await this.saveProgress(progress);

      const allDictIds = [...this.options.dictionaryIds];
      if (patternDictId) allDictIds.push(patternDictId);

      let fromDictionaries = 0;
      for (const dictId of this.options.dictionaryIds) {
        const count = await db.dictionaryPassword.count({
          where: { dictionaryId: dictId },
        });
        fromDictionaries += count;
      }

      const totalPasswords = fromDictionaries + patternsGenerated;

      progress.stages[1].status = "completed";
      progress.stages[1].detail = `${totalPasswords} passwords`;
      await this.saveProgress(progress);

      await this.pusher.pushStageComplete(
        "Stage 2: Merge",
        `${totalPasswords} total (${fromDictionaries} dict + ${patternsGenerated} patterns)`,
      );

      // Stage 3: Credential matching
      progress.currentStage = 3;
      progress.stages[2].status = "running";
      await this.saveProgress(progress);

      const engine = new CredentialMatchingEngine(this.options.userId);

      // Push progress during matching
      const interval = setInterval(async () => {
        const p = engine.progress;
        if (p.totalEmails === 0) return;
        progress.stages[2].detail = `${p.processed}/${p.totalEmails} (${p.found} found)`;
        await this.saveProgress(progress);
        await this.pusher.pushProgress(
          this.formatProgress(progress, p.processed, p.totalEmails),
        );
      }, 5000);

      const matchResult = await engine.run({
        taskId: this.options.taskId,
        emails: this.options.emails,
        dictionaryIds: allDictIds,
        method: this.options.method,
      });

      clearInterval(interval);

      progress.stages[2].status = "completed";
      progress.stages[2].detail = `${matchResult.found} found / ${matchResult.totalEmails} tested`;
      await this.saveProgress(progress);

      await this.pusher.pushStageComplete(
        "Stage 3: Matching",
        `Found ${matchResult.found}/${matchResult.totalEmails}`,
      );

      // Stage 4: Aggregate detection results
      progress.currentStage = 4;
      progress.stages[3].status = "running";
      await this.saveProgress(progress);

      const recoveryStats = await getRecoveryStats(this.options.userId);

      progress.stages[3].status = "completed";
      progress.stages[3].detail = `${recoveryStats.total} recovered`;
      await this.saveProgress(progress);

      // Build final result
      const result: RecoveryPipelineResult = {
        stage1: { patternsGenerated },
        stage2: { totalPasswords, fromDictionaries, fromPatterns: patternsGenerated },
        stage3: {
          emailsTested: matchResult.totalEmails,
          found: matchResult.found,
          notFound: matchResult.notFound,
        },
        stage4: {
          fullAccess: recoveryStats.byAccessLevel["full_access"] ?? 0,
          partial2fa: recoveryStats.byAccessLevel["partial_2fa"] ?? 0,
          tokenOnly: recoveryStats.byAccessLevel["token_only"] ?? 0,
        },
        totalRecovered: matchResult.found,
        duration: Date.now() - startTime,
      };

      // Save report to Redis
      const report = this.formatReport(result);
      await this.redis.set(
        `recovery-pipeline-report:${this.options.taskId ?? "direct"}`,
        report,
        "EX",
        86400,
      );

      const { InlineKeyboard } = await import("grammy");
      const kb = new InlineKeyboard()
        .text("📥 Скачать", "match:results")
        .text("📋 Детали", "rpipe:details");

      await this.pusher.pushFinalResult(
        `✅ <b>Recovery Pipeline завершён</b>\n\n${report}`,
        kb,
      );

      audit({
        userId: this.options.userId,
        type: "recovery_pipeline_completed",
        level: "INFO",
        message: `Recovery: ${matchResult.found}/${matchResult.totalEmails} recovered in ${Math.round(result.duration / 1000)}s`,
      });

      // Cleanup temporary pattern dictionary
      if (patternDictId) {
        await db.passwordDictionary.delete({ where: { id: patternDictId } }).catch(() => {});
      }

      return result;
    } finally {
      this.redis.disconnect();
    }
  }

  private formatProgress(
    progress: RecoveryProgress,
    processed: number,
    total: number,
  ): string {
    const stageIcon = (s: StageStatus) =>
      s.status === "completed" ? "✅" : s.status === "running" ? "⏳" : "⏸";

    const stageInfo = (s: StageStatus, name: string) =>
      `${stageIcon(s)} ${name}: ${s.detail ?? s.status}`;

    return (
      `⏳ <b>Recovery Pipeline</b>\n\n` +
      `${stageInfo(progress.stages[0], "Patterns")}\n` +
      `${stageInfo(progress.stages[1], "Merge")}\n` +
      `${stageInfo(progress.stages[2], "Matching")}\n` +
      `${stageInfo(progress.stages[3], "Detection")}\n\n` +
      renderProgressBar(processed, total)
    );
  }

  private formatReport(result: RecoveryPipelineResult): string {
    const pct = (n: number, t: number) =>
      t > 0 ? `${Math.round((n / t) * 100)}%` : "0%";

    return [
      `Emails: ${result.stage3.emailsTested}`,
      `Recovered: ${result.totalRecovered} (${pct(result.totalRecovered, result.stage3.emailsTested)})`,
      `  🟢 Full Access: ${result.stage4.fullAccess}`,
      `  🟡 2FA Partial: ${result.stage4.partial2fa}`,
      `  🔵 Token Only: ${result.stage4.tokenOnly}`,
      `Not Found: ${result.stage3.notFound}`,
      `Passwords: ${result.stage2.totalPasswords} (${result.stage2.fromDictionaries} dict + ${result.stage2.fromPatterns} patterns)`,
      `Duration: ${Math.round(result.duration / 1000)}s`,
    ].join("\n");
  }

  private async saveProgress(progress: RecoveryProgress): Promise<void> {
    await this.redis.set(this.progressKey, JSON.stringify(progress), "EX", 86400);
  }
}

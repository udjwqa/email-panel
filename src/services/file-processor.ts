import { Api } from "grammy";
import { db } from "./db.js";
import { parseEmailFile, ParseResult } from "./parser.js";
import { Task } from "@prisma/client";

const BATCH_SIZE = 1000;

export interface ProcessResult {
  task: Task;
  parseResult: ParseResult;
}

export async function processFile(
  api: Api,
  userId: number,
  fileId: string,
  fileName: string,
  botToken: string,
): Promise<ProcessResult> {
  const file = await api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: HTTP ${response.status}`);
  }
  const content = await response.text();

  const parseResult = parseEmailFile(content);

  const task = await db.task.create({
    data: {
      userId,
      fileName,
      status: "CREATED",
      totalRows: parseResult.totalLines,
      validCount: parseResult.validLines,
      invalidCount: parseResult.invalidLines,
      duplicateCount: parseResult.duplicateCount,
    },
  });

  const { entries } = parseResult;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db.email.createMany({
      data: batch.map((e) => ({
        taskId: task.id,
        email: e.email,
        password: e.password,
        domain: e.domain,
        status: "VALID_FORMAT",
        source: fileName,
      })),
    });
  }

  return { task, parseResult };
}

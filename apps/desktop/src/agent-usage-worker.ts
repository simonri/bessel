import { parentPort } from "node:worker_threads";
import { type TokenCounts, TranscriptScanner } from "./agent-usage-core.js";

// Off the main thread: the first scan reads gigabytes of transcripts. The
// scanner lives as long as the worker, so later scans read only what's new.

export interface ScanRequest {
  id: number;
  projectsDir: string;
  cutoffDay: string;
}

export interface ScanResponse {
  id: number;
  totals?: [string, TokenCounts][];
  error?: string;
}

const scanners = new Map<string, TranscriptScanner>();

parentPort?.on(
  "message",
  async ({ id, projectsDir, cutoffDay }: ScanRequest) => {
    let scanner = scanners.get(projectsDir);
    if (!scanner) {
      scanner = new TranscriptScanner(projectsDir);
      scanners.set(projectsDir, scanner);
    }
    try {
      const totals = await scanner.scan(cutoffDay);
      parentPort?.postMessage({
        id,
        totals: [...totals],
      } satisfies ScanResponse);
    } catch (err) {
      parentPort?.postMessage({
        id,
        error: String(err),
      } satisfies ScanResponse);
    }
  },
);

import { estimateETA } from "./ETAEstimator";
import {
  PIPELINE_STEP_ORDER,
  type PipelineProgressSnapshot,
  type PipelineRunState,
} from "./types";

export function buildPipelineProgress(
  run: PipelineRunState,
  now: Date = new Date(),
): PipelineProgressSnapshot {
  const steps = PIPELINE_STEP_ORDER.map((name) => ({ ...run.steps[name] }));
  const total = steps.reduce((sum, step) => sum + Math.max(0, step.total), 0);
  const processed = steps.reduce(
    (sum, step) => sum + Math.min(Math.max(0, step.processed), Math.max(0, step.total)),
    0,
  );
  const succeeded = steps.reduce((sum, step) => sum + Math.max(0, step.succeeded), 0);
  const failed = steps.reduce((sum, step) => sum + Math.max(0, step.failed), 0);
  const remaining = Math.max(0, total - processed);
  const percent = total === 0 ? (run.status === "completed" ? 100 : 0) : (processed / total) * 100;
  const eta = estimateETA({ processed, total, startedAt: run.startedAt, now });

  return {
    runId: run.id,
    version: run.version,
    mode: run.mode,
    status: run.status,
    activeStep: run.activeStep,
    total,
    processed,
    remaining,
    succeeded,
    failed,
    percent: Math.round(percent * 100) / 100,
    elapsedSeconds: eta.elapsedSeconds,
    speedPerSecond: eta.speedPerSecond,
    etaSeconds: run.status === "running" || run.status === "stopping" ? eta.etaSeconds : null,
    stopRequested: run.stopRequestedAt !== null,
    steps,
  };
}

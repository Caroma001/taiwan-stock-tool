import { buildPipelineProgress } from "./PipelineProgress";
import {
  clonePipelineRun,
  createPipelineRun,
  isTerminalRun,
} from "./PipelineState";
import {
  PIPELINE_STEP_ORDER,
  type PipelineProgressSnapshot,
  type PipelineRunState,
  type PipelineStepName,
  type StartPipelineOptions,
  type StepProgressPatch,
} from "./types";

export class PipelineConflictError extends Error {
  constructor(message = "已有 Pipeline 正在執行") {
    super(message);
    this.name = "PipelineConflictError";
  }
}

export class PipelineStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineStateError";
  }
}

export class PipelineManager {
  private currentRun: PipelineRunState | null = null;

  start(options: StartPipelineOptions = {}): PipelineRunState {
    if (this.currentRun && !isTerminalRun(this.currentRun)) {
      throw new PipelineConflictError();
    }
    this.currentRun = createPipelineRun(options);
    return this.getRunOrThrow();
  }

  begin(now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    if (run.status !== "queued") {
      throw new PipelineStateError(`無法由 ${run.status} 進入 running`);
    }
    run.status = "running";
    run.startedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  beginStep(name: PipelineStepName, total = 0, now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    this.assertRunnable(run);
    if (run.activeStep && run.activeStep !== name) {
      throw new PipelineStateError(`步驟 ${run.activeStep} 尚未結束`);
    }
    this.assertPreviousStepsFinished(run, name);
    const step = run.steps[name];
    if (step.status !== "waiting") {
      throw new PipelineStateError(`步驟 ${name} 目前狀態為 ${step.status}`);
    }
    run.activeStep = name;
    step.status = "running";
    step.total = normalizeCount(total);
    step.startedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  updateStep(name: PipelineStepName, patch: StepProgressPatch): PipelineRunState {
    const run = this.mutableRun();
    const step = run.steps[name];
    if (run.activeStep !== name || step.status !== "running") {
      throw new PipelineStateError(`步驟 ${name} 並非執行中`);
    }

    const nextTotal = patch.total === undefined ? step.total : normalizeCount(patch.total);
    const nextProcessed = patch.processed === undefined ? step.processed : normalizeCount(patch.processed);
    const nextSucceeded = patch.succeeded === undefined ? step.succeeded : normalizeCount(patch.succeeded);
    const nextFailed = patch.failed === undefined ? step.failed : normalizeCount(patch.failed);

    if (nextProcessed > nextTotal) {
      throw new PipelineStateError("processed 不可大於 total");
    }
    if (nextSucceeded + nextFailed > nextProcessed) {
      throw new PipelineStateError("succeeded + failed 不可大於 processed");
    }

    Object.assign(step, {
      total: nextTotal,
      processed: nextProcessed,
      succeeded: nextSucceeded,
      failed: nextFailed,
      lastSymbol: patch.lastSymbol === undefined ? step.lastSymbol : patch.lastSymbol,
    });
    return this.getRunOrThrow();
  }

  completeStep(name: PipelineStepName, now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    const step = run.steps[name];
    if (run.activeStep !== name || step.status !== "running") {
      throw new PipelineStateError(`步驟 ${name} 並非執行中`);
    }
    step.status = "completed";
    step.processed = step.total;
    if (step.succeeded + step.failed < step.processed) {
      step.succeeded = step.processed - step.failed;
    }
    step.finishedAt = now.toISOString();
    run.activeStep = null;
    return this.getRunOrThrow();
  }

  skipStep(name: PipelineStepName, now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    this.assertPreviousStepsFinished(run, name);
    const step = run.steps[name];
    if (step.status !== "waiting") {
      throw new PipelineStateError(`步驟 ${name} 無法略過`);
    }
    step.status = "skipped";
    step.startedAt = now.toISOString();
    step.finishedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  failStep(name: PipelineStepName, error: unknown, now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    const message = toErrorMessage(error);
    const step = run.steps[name];
    step.status = "failed";
    step.error = message;
    step.finishedAt = now.toISOString();
    run.activeStep = null;
    run.status = "failed";
    run.error = message;
    run.finishedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  requestStop(now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    if (isTerminalRun(run)) return this.getRunOrThrow();
    run.stopRequestedAt = run.stopRequestedAt ?? now.toISOString();
    run.status = "stopping";
    return this.getRunOrThrow();
  }

  acknowledgeStop(now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    if (run.status !== "stopping") {
      throw new PipelineStateError("尚未收到停止要求");
    }
    if (run.activeStep) {
      const step = run.steps[run.activeStep];
      step.status = "stopped";
      step.finishedAt = now.toISOString();
    }
    run.activeStep = null;
    run.status = "stopped";
    run.finishedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  complete(now: Date = new Date()): PipelineRunState {
    const run = this.mutableRun();
    if (run.activeStep) {
      throw new PipelineStateError(`步驟 ${run.activeStep} 尚未結束`);
    }
    const unfinished = PIPELINE_STEP_ORDER.filter((name) =>
      !["completed", "skipped"].includes(run.steps[name].status),
    );
    if (unfinished.length > 0) {
      throw new PipelineStateError(`尚有未完成步驟：${unfinished.join(", ")}`);
    }
    run.status = "completed";
    run.finishedAt = now.toISOString();
    return this.getRunOrThrow();
  }

  getRun(): PipelineRunState | null {
    return this.currentRun ? clonePipelineRun(this.currentRun) : null;
  }

  getProgress(now: Date = new Date()): PipelineProgressSnapshot | null {
    return this.currentRun ? buildPipelineProgress(this.currentRun, now) : null;
  }

  reset(): void {
    if (this.currentRun && !isTerminalRun(this.currentRun)) {
      throw new PipelineConflictError("執行中的 Pipeline 不可重設");
    }
    this.currentRun = null;
  }

  private mutableRun(): PipelineRunState {
    if (!this.currentRun) throw new PipelineStateError("尚未建立 Pipeline Run");
    return this.currentRun;
  }

  private getRunOrThrow(): PipelineRunState {
    const run = this.getRun();
    if (!run) throw new PipelineStateError("Pipeline Run 不存在");
    return run;
  }

  private assertRunnable(run: PipelineRunState): void {
    if (run.status !== "running") {
      throw new PipelineStateError(`Pipeline 目前狀態為 ${run.status}`);
    }
    if (run.stopRequestedAt) {
      throw new PipelineStateError("Pipeline 已收到停止要求");
    }
  }

  private assertPreviousStepsFinished(run: PipelineRunState, name: PipelineStepName): void {
    const index = PIPELINE_STEP_ORDER.indexOf(name);
    const unfinished = PIPELINE_STEP_ORDER.slice(0, index).filter((previous) =>
      !["completed", "skipped"].includes(run.steps[previous].status),
    );
    if (unfinished.length > 0) {
      throw new PipelineStateError(`前置步驟尚未完成：${unfinished.join(", ")}`);
    }
  }
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new PipelineStateError("數量必須是非負有限數字");
  }
  return Math.floor(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

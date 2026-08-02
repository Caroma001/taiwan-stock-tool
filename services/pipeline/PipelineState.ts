import {
  PIPELINE_STEP_ORDER,
  PIPELINE_VERSION,
  type PipelineMode,
  type PipelineRunState,
  type PipelineStepName,
  type PipelineStepState,
  type StartPipelineOptions,
} from "./types";

function iso(date: Date): string {
  return date.toISOString();
}

export function createPipelineStep(name: PipelineStepName): PipelineStepState {
  return {
    name,
    status: "waiting",
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    lastSymbol: null,
    error: null,
  };
}

export function createPipelineRun(options: StartPipelineOptions = {}): PipelineRunState {
  const now = options.now ?? new Date();
  const mode: PipelineMode = options.mode ?? "dry_run";
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const steps = Object.fromEntries(
    PIPELINE_STEP_ORDER.map((name) => [name, createPipelineStep(name)]),
  ) as PipelineRunState["steps"];

  return {
    id: idFactory(),
    version: PIPELINE_VERSION,
    mode,
    status: "queued",
    createdAt: iso(now),
    startedAt: null,
    finishedAt: null,
    stopRequestedAt: null,
    activeStep: null,
    symbols: [...new Set(options.symbols ?? [])],
    steps,
    error: null,
  };
}

export function clonePipelineRun(run: PipelineRunState): PipelineRunState {
  return {
    ...run,
    symbols: [...run.symbols],
    steps: Object.fromEntries(
      PIPELINE_STEP_ORDER.map((name) => [name, { ...run.steps[name] }]),
    ) as PipelineRunState["steps"],
  };
}

export function isTerminalRun(run: PipelineRunState): boolean {
  return ["stopped", "completed", "failed"].includes(run.status);
}

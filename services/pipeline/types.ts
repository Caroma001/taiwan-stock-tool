export const PIPELINE_VERSION = "M5.4.0-A" as const;

export const PIPELINE_STEP_ORDER = [
  "detect_changes",
  "prices",
  "indicators",
  "analysis",
  "decisions",
  "ranking",
] as const;

export type PipelineStepName = (typeof PIPELINE_STEP_ORDER)[number];
export type PipelineMode = "dry_run" | "test" | "production";
export type PipelineRunStatus =
  | "idle"
  | "queued"
  | "running"
  | "stopping"
  | "stopped"
  | "completed"
  | "failed";
export type PipelineStepStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "stopped";

export interface PipelineStepState {
  name: PipelineStepName;
  status: PipelineStepStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastSymbol: string | null;
  error: string | null;
}

export interface PipelineRunState {
  id: string;
  version: typeof PIPELINE_VERSION;
  mode: PipelineMode;
  status: PipelineRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequestedAt: string | null;
  activeStep: PipelineStepName | null;
  symbols: string[];
  steps: Record<PipelineStepName, PipelineStepState>;
  error: string | null;
}

export interface PipelineProgressSnapshot {
  runId: string;
  version: typeof PIPELINE_VERSION;
  mode: PipelineMode;
  status: PipelineRunStatus;
  activeStep: PipelineStepName | null;
  total: number;
  processed: number;
  remaining: number;
  succeeded: number;
  failed: number;
  percent: number;
  elapsedSeconds: number;
  speedPerSecond: number;
  etaSeconds: number | null;
  stopRequested: boolean;
  steps: PipelineStepState[];
}

export interface StartPipelineOptions {
  mode?: PipelineMode;
  symbols?: string[];
  now?: Date;
  idFactory?: () => string;
}

export interface StepProgressPatch {
  total?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  lastSymbol?: string | null;
}

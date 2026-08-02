export interface ETAInput {
  processed: number;
  total: number;
  startedAt: string | null;
  now?: Date;
}

export interface ETAResult {
  elapsedSeconds: number;
  speedPerSecond: number;
  etaSeconds: number | null;
}

export function estimateETA(input: ETAInput): ETAResult {
  if (!input.startedAt) {
    return { elapsedSeconds: 0, speedPerSecond: 0, etaSeconds: null };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const startMs = new Date(input.startedAt).getTime();
  const elapsedSeconds = Math.max(0, (nowMs - startMs) / 1000);
  const processed = Math.max(0, input.processed);
  const total = Math.max(0, input.total);
  const speedPerSecond = elapsedSeconds > 0 ? processed / elapsedSeconds : 0;
  const remaining = Math.max(0, total - processed);
  const etaSeconds = speedPerSecond > 0 ? remaining / speedPerSecond : null;

  return {
    elapsedSeconds: round(elapsedSeconds),
    speedPerSecond: round(speedPerSecond),
    etaSeconds: etaSeconds === null ? null : Math.ceil(etaSeconds),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

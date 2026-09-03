export type DevelopmentModeConfig = {
  enabled: boolean;
  manualOnly: boolean;
  batchSize: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDevelopmentModeConfig(): DevelopmentModeConfig {
  return {
    enabled: process.env.DEVELOPMENT_MODE !== "false",
    manualOnly: true,
    batchSize: Math.min(40, positiveInteger(process.env.DEV_UPDATE_BATCH_SIZE, 24)),
  };
}

export function assertDevelopmentMode(): DevelopmentModeConfig {
  const config = getDevelopmentModeConfig();
  if (!config.enabled) {
    throw new Error("Development Mode 尚未啟用。請在共用 .env.local 設定 DEVELOPMENT_MODE=true。");
  }
  return config;
}

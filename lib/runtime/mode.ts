export type RuntimeMode = "development" | "production";

export type RuntimeSafetyConfig = {
  mode: RuntimeMode;
  developmentMode: boolean;
  cloudAutomationEnabled: boolean;
  vercelCronEnabled: boolean;
  emailAutomationEnabled: boolean;
  gitDeploymentEnabled: boolean;
};

function enabled(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function getRuntimeSafetyConfig(): RuntimeSafetyConfig {
  const mode: RuntimeMode =
    process.env.APP_RUNTIME_MODE?.trim().toLowerCase() === "production"
      ? "production"
      : "development";

  const production = mode === "production";

  return {
    mode,
    developmentMode: !production,
    cloudAutomationEnabled: production && enabled("CLOUD_AUTOMATION_ENABLED"),
    vercelCronEnabled: production && enabled("VERCEL_CRON_ENABLED"),
    emailAutomationEnabled: production && enabled("EMAIL_AUTOMATION_ENABLED"),
    gitDeploymentEnabled: production && enabled("GIT_DEPLOYMENT_ENABLED"),
  };
}

export function assertCloudAutomationEnabled(): RuntimeSafetyConfig {
  const config = getRuntimeSafetyConfig();
  if (!config.cloudAutomationEnabled) {
    throw new Error(
      "Cloud automation is disabled. M8.4 Development Mode only allows local manual updates.",
    );
  }
  return config;
}

export function assertVercelCronEnabled(): RuntimeSafetyConfig {
  const config = getRuntimeSafetyConfig();
  if (!config.vercelCronEnabled) {
    throw new Error(
      "Vercel Cron is disabled. Set APP_RUNTIME_MODE=production and VERCEL_CRON_ENABLED=true only after formal release approval.",
    );
  }
  return config;
}

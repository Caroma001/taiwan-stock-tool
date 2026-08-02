import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "twstock",
    version: "7.6.2",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
    deploymentUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000",
    git: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      repository: process.env.VERCEL_GIT_REPO_SLUG ?? null,
    },
    deployedAt: new Date().toISOString(),
  });
}

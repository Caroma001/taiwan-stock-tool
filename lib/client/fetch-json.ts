export class ApiResponseError extends Error {
  endpoint: string;
  status: number;
  bodyPreview: string;

  constructor(endpoint: string, status: number, message: string, bodyPreview = "") {
    super(message);
    this.name = "ApiResponseError";
    this.endpoint = endpoint;
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

function preview(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 220);
}

export async function fetchJson<T>(
  endpoint: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(endpoint, init);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    let serverMessage = "";
    if (contentType.includes("application/json") && raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
        serverMessage = String(parsed.error ?? parsed.message ?? "");
      } catch {
        // Fall through to the response preview below.
      }
    }

    const bodyPreview = preview(raw);
    throw new ApiResponseError(
      endpoint,
      response.status,
      serverMessage || `API ${response.status} 錯誤`,
      bodyPreview,
    );
  }

  if (!raw) return {} as T;

  if (!contentType.includes("application/json")) {
    throw new ApiResponseError(
      endpoint,
      response.status,
      "API 回傳非 JSON 格式",
      preview(raw),
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiResponseError(
      endpoint,
      response.status,
      "API JSON 解析失敗",
      preview(raw),
    );
  }
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiResponseError) {
    const body = error.bodyPreview ? `｜${error.bodyPreview}` : "";
    return `${error.endpoint}：${error.message}${body}`;
  }
  return error instanceof Error ? error.message : String(error);
}

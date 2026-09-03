export async function fetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (!contentType.includes("application/json")) {
    const hint = raw.trim().startsWith("<!DOCTYPE") || raw.trim().startsWith("<html")
      ? "API 路徑不存在或伺服器回傳了 HTML 錯誤頁面"
      : "伺服器回傳格式不是 JSON";
    throw new Error(`${hint}（HTTP ${response.status}）`);
  }

  let payload: any;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`API 回傳內容無法解析（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `請求失敗（HTTP ${response.status}）`);
  }
  return payload as T;
}

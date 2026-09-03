export type TradingDateResolution = {
  calendarDate: string;
  effectiveTradingDate: string;
  jobDate: string;
  marketClosedToday: boolean;
  beforeSafeClose: boolean;
  source: "twse-holiday-api" | "calendar-fallback";
  reason: string;
};

type TwseHolidayRow = {
  Name?: string;
  Date?: string;
  Weekday?: string;
  Description?: string;
};

const TAIPEI_TZ = "Asia/Taipei";
const SAFE_CLOSE_HOUR = 15;
const HOLIDAY_CACHE_MS = 6 * 60 * 60 * 1000;
let holidayCache: { loadedAt: number; rows: TwseHolidayRow[] } | null = null;

function taipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour") || 0),
  };
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousDay(value: string) {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDate(date);
}

function isWeekend(value: string) {
  const day = parseIsoDate(value).getUTCDay();
  return day === 0 || day === 6;
}

function rocDateToIso(value: string): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 7) return null;
  const rocYear = Number(digits.slice(0, 3));
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  if (!rocYear || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${rocYear + 1911}-${month}-${day}`;
}

function rowIsClosed(row: TwseHolidayRow) {
  const name = String(row.Name ?? "");
  const description = String(row.Description ?? "");
  // TWSE holiday feed also includes explicit "first trading day" / "last trading day" rows.
  // Those are trading sessions and must never be classified as holidays.
  if (/開始交易日|最後交易日|開始交易|最後交易/.test(`${name} ${description}`)) return false;
  return true;
}

async function loadTwseHolidayRows(): Promise<TwseHolidayRow[]> {
  if (holidayCache && Date.now() - holidayCache.loadedAt < HOLIDAY_CACHE_MS) return holidayCache.rows;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`TWSE holiday API HTTP ${response.status}`);
    const json = await response.json();
    const rows = Array.isArray(json) ? json as TwseHolidayRow[] : [];
    holidayCache = { loadedAt: Date.now(), rows };
    return rows;
  } finally {
    clearTimeout(timeout);
  }
}

function holidaySet(rows: TwseHolidayRow[]) {
  const closed = new Set<string>();
  for (const row of rows) {
    if (!rowIsClosed(row)) continue;
    const value = rocDateToIso(String(row.Date ?? ""));
    if (value) closed.add(value);
  }
  return closed;
}

/**
 * Resolves the latest completed Taiwan cash-market session that is safe to use
 * as the daily-update job identity.
 *
 * - Weekends walk back to Friday.
 * - Before 15:00 Taipei on a trading weekday, use the previous session so the
 *   job never represents a partially-open day.
 * - TWSE official holiday data is used when available.
 * - If the holiday endpoint is temporarily unavailable, weekend/pre-close
 *   calendar logic remains usable instead of blocking the update button.
 */
export async function resolveEffectiveTradingDate(now = new Date()): Promise<TradingDateResolution> {
  const taipei = taipeiParts(now);
  const calendarDate = taipei.date;
  const beforeSafeClose = taipei.hour < SAFE_CLOSE_HOUR;

  let rows: TwseHolidayRow[] = [];
  let source: TradingDateResolution["source"] = "calendar-fallback";
  try {
    rows = await loadTwseHolidayRows();
    if (rows.length) source = "twse-holiday-api";
  } catch (error) {
    console.warn("[trading-date] TWSE holiday API unavailable; using calendar fallback:", error);
  }
  const closed = holidaySet(rows);
  const todayClosed = isWeekend(calendarDate) || closed.has(calendarDate);

  let candidate = calendarDate;
  if (beforeSafeClose || todayClosed) candidate = previousDay(candidate);

  for (let guard = 0; guard < 20; guard += 1) {
    if (!isWeekend(candidate) && !closed.has(candidate)) break;
    candidate = previousDay(candidate);
  }

  const reason = todayClosed
    ? `今日 ${calendarDate} 為休市日，使用最近有效交易日 ${candidate}`
    : beforeSafeClose
      ? `今日 ${calendarDate} 尚未到 15:00 安全收盤時間，使用最近完成交易日 ${candidate}`
      : `今日 ${calendarDate} 已過安全收盤時間，使用當日交易日 ${candidate}`;

  return {
    calendarDate,
    effectiveTradingDate: candidate,
    jobDate: `${candidate}-development`,
    marketClosedToday: todayClosed,
    beforeSafeClose,
    source,
    reason,
  };
}

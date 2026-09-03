import { NextRequest, NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso/client";

export const dynamic = "force-dynamic";

const SECTORS: Record<string, string[]> = {
  all: [],
  ai: ["AI", "人工智慧", "伺服器", "雲端", "資訊服務"],
  pcb: ["PCB", "印刷電路", "電路板", "CCL", "銅箔基板"],
  cooling: ["散熱", "風扇", "水冷", "熱傳"],
  memory: ["記憶體", "DRAM", "Flash", "NAND"],
  cpo: ["CPO", "矽光子", "光通訊", "光電"],
  robot: ["機器人", "自動化", "工具機", "機電"],
  defense: ["軍工", "航太", "造船", "無人機"],
  auto: ["汽車", "車用", "電動車"],
  etf: ["ETF"],
};

export async function GET(req: NextRequest) {
  try {
    const sector = String(req.nextUrl.searchParams.get("sector") ?? "all").toLowerCase();
    const top = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get("top") ?? 3)));
    const words = SECTORS[sector] ?? [];
    const client = getTursoClient();
    const filters: string[] = ["COALESCE(a.final_score,a.total_score,0) > 0"];
    const args: any[] = [];

    if (words.length) {
      filters.push(`(${words.map(() => "(s.industry LIKE ? OR s.name LIKE ?)").join(" OR ")})`);
      for (const word of words) args.push(`%${word}%`, `%${word}%`);
    }

    args.push(top);
    const result = await client.execute({
      sql: `
        SELECT s.symbol,s.name,s.industry,s.market,
          i.trade_date,i.close,i.ma20,i.ma60,i.rsi14,
          COALESCE(a.final_score,a.total_score) AS ai_score,
          a.trend_score,a.momentum_score,a.volume_score,a.risk_score,a.confidence,
          d.recommendation,d.target_1,d.stop_loss
        FROM stocks s
        JOIN ai_analysis_latest a ON a.symbol=s.symbol
        LEFT JOIN indicator_latest i ON i.symbol=s.symbol
        LEFT JOIN decision_latest d ON d.symbol=s.symbol
        WHERE ${filters.join(" AND ")}
        ORDER BY COALESCE(a.final_score,a.total_score) DESC, s.symbol
        LIMIT ?
      `,
      args,
    });

    return NextResponse.json({ ok: true, sector, rows: result.rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

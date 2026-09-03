import { PROJECT_RELEASE } from "@/lib/version/project-version";
import Link from "next/link";

export default function StrategyGuide() {
  const items = [
    ["正式選股引擎", "M8.11.8 以校準後 Early Watch 作為前置觀察層：低基期降權、多證據確認；Swing10 Opportunity Grade 作為正式交易決策層，Winner25、法人潛伏與 Risk Intelligence 保留為底層特徵。"],
    ["法人潛伏分 65%", "外資潛伏30%＋投信接棒20%＋強勢回檔20%＋籌碼集中15%＋發動確認15%，再作為最終潛力分的主要即時因子。"],
    ["Winner25 35%", "只有通過時間切割 out-of-sample Gate 的 Winner25 模型才參與正式排序；模型無效時不硬套歷史規則。"],
    ["外資吸籌正規化", "不直接比較買超張數，而以外資5／10／20日淨買超除以20日平均成交量，降低大型股與小型股規模差異。"],
    ["投信接棒加速度", "同時看投信5／10／20日相對成交量強度，特別尋找原先偏弱、最近5日開始轉強的法人接棒型態。"],
    ["強勢回檔", "Winner25 歷史研究顯示，中期均線上彎、短線回檔、距近期高點仍有空間，常出現在後續大波段之前。"],
    ["籌碼集中", "外資持股與 TDCC 大戶／散戶資料作為輔助；缺資料時不補零、不虛構比例，而依可用資料降低完整度。"],
    ["發動確認", "量能、MA20 斜率、重新站回均線與短期轉強用來區分『法人潛伏』與『發動初期』，避免只因法人買超就追價。"],
    ["固定 Top20 Cohort", "舊 Top20 Cohort 僅保留為歷史對照組；新的 5～10 日交易驗證以 Swing10 A1/A0 測試與實際部位為主。"],
    ["Swing10 收盤觀察", "M8.10.27 將 5～10 日 Swing10 觀察接成交易閉環：A級可加入測試或實際買入，保存進場分數；每日收盤後依停利停損、Time Stop、A級退出、決策分與外資續航變化產生賣出檢查。"],
    ["Fast5 快速獲利準備度", "M8.11.8 只在每日綜合日報中做研究型排序：整合 Swing10、Decision 跨日加速度、發動確認、法人續航、Early Watch 與市場風險，縮小 5～10 日候選研究範圍；不取代 A0/A1 Entry Gate，也不自動下單。"],
    ["每日綜合日報", "每日更新完成後只保存 1 筆小型 JSON／文字報告，整合 TAIEX、費半、台指夜盤代理、美元台幣、VIX、Early Watch、A0/A1、相對 Top5、Fast5 與持股提醒，並可直接輸出 TXT／JSON。"],
    ["單一每日更新", "日常資料更新只從『每日一鍵更新』啟動：市場資料→法人籌碼→Winner25/法人潛伏底層分數→Risk Intelligence→Early Watch→Swing10→持股退出提醒→每日綜合日報。"],
  ];

  return <main style={{minHeight:"100vh",background:"#020617",color:"#e2e8f0",padding:"30px 18px"}}>
    <div style={{maxWidth:1150,margin:"0 auto"}}>
      <div style={{color:"#22d3ee",fontWeight:900}}>Bruce TWST-AI {PROJECT_RELEASE}</div>
      <h1>Swing10 選股策略</h1>
      <p style={lead}>M8.11.8 將選股拆成兩層：校準版 Early Watch 先排除低基期假高成長並要求獨立證據，再找基本面/事件/籌碼已改善但價格尚未完全反映者；Swing10 再以 A0/A1、風險姿態與持股退出提醒做真正交易決策。</p>
      <section style={grid}>{items.map(([t,d])=><article style={card} key={t}><h2 style={{marginTop:0}}>{t}</h2><p style={text}>{d}</p></article>)}</section>
      <section style={panel}>
        <h2>底層潛力分</h2>
        <div style={rule}>底層潛力 = 法人潛伏分 65% ＋ 通過 OOS Gate 的 Winner25 爆發分 35%；Swing10 再加入決策分、發動確認、外資續航、風險情報與跨日變化。</div>
        <p style={text}>法人潛伏資料不足時，依可用資料降低信心；Winner25 模型未通過 Gate 時，不讓研究模型改變正式排行。舊版 composite 不再作為正式選股權重。</p>
      </section>
      <section style={panel}>
        <h2>績效驗證</h2>
        <p style={text}>舊 Top20 Cohort 保留作長週期對照；Swing10 以 5～10 個交易日測試／實際部位統計勝率、平均報酬、持有天數、停利停損與退出原因。</p>
      </section>
      <Link href="/swing10" style={link}>前往 Swing10</Link>
      <Link href="/development-center" style={{...link,marginLeft:10,background:"#0f766e"}}>每日一鍵更新</Link>
    </div>
  </main>;
}
const lead={color:"#cbd5e1",fontSize:18,lineHeight:1.8} as const;
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginTop:20} as const;
const card={background:"#0f172a",border:"1px solid #243244",borderRadius:16,padding:20} as const;
const panel={...card,marginTop:16} as const;
const text={color:"#94a3b8",lineHeight:1.75} as const;
const rule={background:"#052e2b",border:"1px solid #0f766e",color:"#99f6e4",padding:16,borderRadius:12,fontWeight:800,lineHeight:1.7} as const;
const link={display:"inline-block",marginTop:18,background:"#2563eb",color:"#fff",padding:"11px 16px",borderRadius:9,textDecoration:"none",fontWeight:800} as const;

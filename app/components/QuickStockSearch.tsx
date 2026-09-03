"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function QuickStockSearch() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = symbol.trim();
    if (/^\d{4,6}$/.test(value)) router.push(`/stock/${value}`);
  }
  return <form onSubmit={submit} style={{display:"flex",gap:6}}>
    <input aria-label="輸入股票代號" value={symbol} onChange={(event)=>setSymbol(event.target.value)} placeholder="股票代號" inputMode="numeric" style={{width:92,padding:"7px 9px",borderRadius:8,border:"1px solid #334155",background:"#020617",color:"#e2e8f0"}}/>
    <button type="submit" style={{padding:"7px 10px",borderRadius:8,border:0,background:"#0e7490",color:"white",fontWeight:800,cursor:"pointer"}}>即時查詢</button>
  </form>;
}

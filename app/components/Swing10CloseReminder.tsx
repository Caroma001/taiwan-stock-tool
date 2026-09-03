"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Reminder={ok?:boolean;shouldRemind?:boolean;kind?:string;tradeDate?:string;message?:string;aGradeCount?:number;riskChangedCount?:number;sellCheckCount?:number};
const PREF_KEY="twstock:swing10:browser-notification";

export default function Swing10CloseReminder(){
  const [data,setData]=useState<Reminder|null>(null);
  const load=useCallback(async()=>{
    try{
      const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
      const weekday=parts.find(p=>p.type==="weekday")?.value??"";
      const hour=Number(parts.find(p=>p.type==="hour")?.value??0);
      if(weekday==="Sat"||weekday==="Sun"||hour<15){setData(null);return;}
      const response=await fetch(`/api/swing10/reminder?_=${Date.now()}`,{cache:"no-store"});
      const payload=await response.json();
      setData(payload);
      if(payload?.shouldRemind && payload?.tradeDate && typeof window!=="undefined" && localStorage.getItem(PREF_KEY)==="on" && "Notification" in window && Notification.permission==="granted"){
        const key=`twstock:swing10:notified:${payload.tradeDate}:${payload.kind??"review"}`;
        if(!localStorage.getItem(key)){
          new Notification("Swing10 收盤檢查",{body:String(payload.message??"請檢查今日 A級候選、風險變化與持股賣出提醒。")});
          localStorage.setItem(key,"1");
        }
      }
    }catch{}
  },[]);
  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(),30*60*1000);
    const onFocus=()=>void load();
    window.addEventListener("focus",onFocus);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",onFocus);};
  },[load]);
  if(!data?.shouldRemind) return null;
  return <div style={shell}><div style={inner}><strong>⏰ Swing10 收盤提醒</strong><span>{data.message}</span><Link href={data.kind==="update_pending"?"/development-center":"/swing10"} style={link}>{data.kind==="update_pending"?"前往每日更新":(data.sellCheckCount??0)>0?"查看賣出檢查":"查看 A級候選"}</Link></div></div>;
}
const shell:React.CSSProperties={position:"relative",zIndex:1100,background:"#422006",borderBottom:"1px solid #d97706",color:"#fef3c7"};
const inner:React.CSSProperties={maxWidth:1560,margin:"0 auto",padding:"7px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:12,flexWrap:"wrap",fontSize:13};
const link:React.CSSProperties={color:"#fff",background:"#b45309",borderRadius:8,padding:"5px 9px",textDecoration:"none",fontWeight:900};

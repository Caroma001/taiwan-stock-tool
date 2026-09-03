# twstock-M8.7 — AI Portfolio

本版本建立投資組合層級的規則化 AI 分析：

- Portfolio Score：健康度、資金效率、集中度、分散度、風險
- 持股資金效率排名
- 嚴格門檻換股觀察（原持股弱、候選分數至少高 15 分）
- 產業配置與集中度
- 每日投資摘要
- Turso 投資組合每日快照與績效時間序列

## 啟動

```bash
cd ~/Projects/twstock-M8.7
node scripts/link-shared-env.mjs
npm install
npm run build
npm run dev
```

頁面：`/ai-portfolio`

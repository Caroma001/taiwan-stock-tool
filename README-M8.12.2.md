# TWSTOCK M8.12.2

## 目的
M8.12.2 是 M8.12.x 的簡化穩定版。

## 修正
- Bruce Score / Data Quality migration 固定使用 40，避免共用 Turso 既有 migration 39 衝突。
- 保留 Swing10、Early Watch、Fast5、Daily Training、Portfolio。
- Daily Report / Training Export 版本統一為 M8.12.2。
- 自動沿用有效 Turso .env.local。
- 使用者不需要再執行獨立 Repair / Migration / Builder。

## 操作
日後只要雙擊 M8.12.2.command。

# LINE Bot 報單機器人

使用 Cloudflare Workers 建立的加密貨幣交易信號 LINE Bot，基於 Vegas Tunnel 技術分析策略。

## 功能特色

✅ **Vegas Tunnel 策略分析**
- 使用 5 條 EMA 線（12, 144, 169, 576, 676）
- 自動判斷多空排列和信號觸發
- 高準確度的技術分析算法

✅ **自動報單格式**
- 標準化的報單格式輸出
- Fibonacci 止盈位計算 (1.0, 1.618, 2.0)
- 包含風險提醒和使用說明

✅ **多幣種支援**
- BTC, ETH, BNB, SOL, ADA, XRP, DOT, DOGE, AVAX, LINK
- 支援多時間周期分析
- 實時價格數據獲取

✅ **LINE Bot 整合**
- Webhook 事件處理
- 自動回覆和群發功能
- 簽名驗證確保安全性

## 報單格式範例

```
🔴 合約交易信號 🔴

📊 幣種：BTC/USDT
📈 方向/時區/槓桿：多/1小時/10X
🎯 進場點位：45,250.00

🎯 止盈目標：
第一止盈位 (Fibo 1.0)：46,500.00
第二止盈位 (Fibo 1.618)：47,250.00
第三止盈位 (Fibo 2.0)：48,000.00

⚠️ 風險提醒：
🔸 超過區間盡量別追高
🔸 僅供參考，不構成投資建議
🔸 投資有風險，請控制倉位

📊 策略：Vegas Tunnel
⏰ 時間：2025-09-03 15:30:00

💡 記得設置止損，控制風險！
```

## 部署步驟

### 1. 安裝依賴

```bash
cd my-first-worker
npm install
```

### 2. 設置 LINE Bot

1. 到 [LINE Developers](https://developers.line.biz/) 創建 Channel
2. 記錄 Channel Access Token 和 Channel Secret

### 3. 配置環境變數

#### 本地開發
1. 複製範例配置檔：
```bash
cp wrangler.local.jsonc wrangler.jsonc
```

2. 編輯 `wrangler.jsonc`，替換為你的真實 LINE Bot 金鑰：
```json
"vars": {
  "NODE_ENV": "development",
  "LINE_CHANNEL_ACCESS_TOKEN": "你的_channel_access_token",
  "LINE_CHANNEL_SECRET": "你的_channel_secret"
}
```

#### 生產環境部署
```bash
# 設置 LINE Bot 金鑰（注意：這些是機密資料）
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put LINE_CHANNEL_SECRET
```

### 4. 創建 KV 存儲

```bash
# 創建 KV 命名空間來存儲聊天列表
wrangler kv:namespace create "CHAT_STORAGE"

# 複製生成的 ID 並更新 wrangler.jsonc 中的 "id" 欄位
# 例如：如果生成 id = "abc123def456"，則更新：
# "kv_namespaces": [
#   {
#     "binding": "CHAT_STORAGE",
#     "id": "abc123def456",
#     "preview_id": "preview_id"
#   }
# ]
```

### 5. 部署到 Cloudflare

```bash
npm run deploy
```

### 6. 設置 LINE Bot Webhook

在 LINE Developers 控制台設置 Webhook URL：
```
https://your-worker.your-subdomain.workers.dev/webhook
```

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/webhook` | POST | LINE Bot Webhook 接收端點 |
| `/analyze` | POST | 手動觸發交易信號分析 |
| `/status` | GET | 檢查系統運行狀態 |
| `/test` | GET | 測試機器人是否正常運行 |

### 手動分析 API 使用範例

```bash
# 分析 BTC 1小時周期
curl -X POST https://your-worker.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC",
    "timeframe": "1h"
  }'

# 發送信號給特定用戶
curl -X POST https://your-worker.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ETH",
    "timeframe": "4h",
    "userId": "LINE_USER_ID"
  }'
```

## 本地開發

```bash
# 啟動開發伺服器
npm run dev

# 執行測試
npm run test
```

## 定期任務

機器人每小時自動執行以下任務：
- 分析主要幣種 (BTC, ETH, BNB, SOL)
- 檢測 Vegas Tunnel 信號
- 自動發送交易信號到 LINE

## Vegas Tunnel 策略說明

Vegas Tunnel 是一個基於多條 EMA 線的趨勢跟隨策略：

### 指標設置
- **過濾線**: EMA 12
- **通道1**: EMA 144 & EMA 169  
- **通道2**: EMA 576 & EMA 676

### 多頭信號條件
1. EMA 12 > EMA 144 > EMA 169 > EMA 576 > EMA 676 (多頭排列)
2. 價格觸及 EMA 144 後收盤價回到 EMA 12 以上

### 空頭信號條件
1. EMA 12 < EMA 144 < EMA 169 < EMA 576 < EMA 676 (空頭排列)
2. 價格觸及 EMA 144 後收盤價回到 EMA 12 以下

## 支援的幣種

| 符號 | 全名 | Binance 交易對 |
|------|------|----------------|
| BTC | Bitcoin | BTCUSDT |
| ETH | Ethereum | ETHUSDT |
| BNB | Binance Coin | BNBUSDT |
| SOL | Solana | SOLUSDT |
| ADA | Cardano | ADAUSDT |
| XRP | Ripple | XRPUSDT |
| DOT | Polkadot | DOTUSDT |
| DOGE | Dogecoin | DOGEUSDT |
| AVAX | Avalanche | AVAXUSDT |
| LINK | Chainlink | LINKUSDT |

## 注意事項

⚠️ **風險提醒**
- 本機器人提供的信號僅供參考，不構成投資建議
- 加密貨幣投資風險極高，請謹慎操作
- 建議使用前進行充分的回測和小額測試

🔐 **安全性**
- 所有 API 金鑰都使用 Cloudflare Secrets 安全存儲
- Webhook 請求經過簽名驗證
- 支援 CORS 跨域請求

📊 **數據來源**
- 價格數據來自 Binance 公開 API
- 所有計算都在 Cloudflare Edge 執行
- 低延遲、高可用性

## 故障排除

### 常見問題

**Q: 機器人沒有回應？**
A: 檢查 LINE Bot Webhook URL 是否正確設置，確認 SSL 憑證有效。

**Q: 信號不準確？**
A: Vegas Tunnel 策略適合趨勢市場，在震盪市場中可能產生較多假信號。

**Q: 如何添加新的幣種？**
A: 在 `src/price-data.ts` 的 `SYMBOL_MAPPING` 中添加新的映射關係。

### 日誌查看

```bash
# 查看 Worker 日誌
wrangler tail

# 查看特定時間的日誌
wrangler tail --since 1h
```

## 貢獻

歡迎提交 Issue 和 Pull Request 來改善這個項目！

## 授權

MIT License
import { TradingSignal } from './types';
import { getIntervalInChinese } from './price-data';

/**
 * 格式化交易信號為報單格式
 */
export function formatTradingSignal(signal: TradingSignal): string {
  const direction = signal.direction === 'long' ? '多' : '空';
  const directionEmoji = signal.direction === 'long' ? '🔴' : '🟢';
  
  // 格式化價格 - 保留適當的小數位數
  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    } else if (price >= 1) {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 4, 
        maximumFractionDigits: 4 
      });
    } else {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 6, 
        maximumFractionDigits: 6 
      });
    }
  };

  const timeframe = getIntervalInChinese(signal.timeframe);
  const timestamp = new Date(signal.timestamp).toLocaleString('zh-TW');

  return `${directionEmoji} 合約交易信號 ${directionEmoji}

📊 幣種：${signal.symbol}/USDT
📈 方向/時區/槓桿：${direction}/${timeframe}/${signal.leverage}X
🎯 進場點位：${formatPrice(signal.entryPrice)}

🎯 止盈目標：
第一止盈位 (Fibo 1.0)：${formatPrice(signal.targets.target1)}
第二止盈位 (Fibo 1.618)：${formatPrice(signal.targets.target2)}
第三止盈位 (Fibo 2.0)：${formatPrice(signal.targets.target3)}

⚠️ 風險提醒：
🔸 超過區間盡量別追高
🔸 僅供參考，不構成投資建議
🔸 投資有風險，請控制倉位

📊 策略：Vegas Tunnel
⏰ 時間：${timestamp}

💡 記得設置止損，控制風險！`;
}

/**
 * 格式化價格變動通知
 */
export function formatPriceAlert(
  symbol: string,
  currentPrice: number,
  previousPrice: number,
  changePercent: number
): string {
  const changeEmoji = changePercent >= 0 ? '🔴' : '🟢';
  const changeSign = changePercent >= 0 ? '+' : '';
  
  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    } else if (price >= 1) {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 4, 
        maximumFractionDigits: 4 
      });
    } else {
      return price.toLocaleString('zh-TW', { 
        minimumFractionDigits: 6, 
        maximumFractionDigits: 6 
      });
    }
  };

  return `${changeEmoji} 價格提醒 ${changeEmoji}

📊 ${symbol}/USDT
💰 目前價格：${formatPrice(currentPrice)}
📈 漲跌幅：${changeSign}${changePercent.toFixed(2)}%
⏰ 時間：${new Date().toLocaleString('zh-TW')}`;
}

/**
 * 格式化市場概況
 */
export function formatMarketOverview(data: {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
}[]): string {
  let message = '📊 市場概況 📊\n\n';
  
  data.forEach((item, index) => {
    const changeEmoji = item.change24h >= 0 ? '🟢' : '🔴';
    const changeSign = item.change24h >= 0 ? '+' : '';
    
    message += `${index + 1}. ${item.symbol}\n`;
    message += `   💰 $${item.price.toLocaleString()}\n`;
    message += `   ${changeEmoji} ${changeSign}${item.change24h.toFixed(2)}%\n`;
    
    if (index < data.length - 1) {
      message += '\n';
    }
  });
  
  message += `\n⏰ 更新時間：${new Date().toLocaleString('zh-TW')}`;
  
  return message;
}

/**
 * 格式化錯誤訊息
 */
export function formatErrorMessage(error: string, context?: string): string {
  return `❌ 系統提醒 ❌

🔧 錯誤：${error}
${context ? `📝 詳情：${context}\n` : ''}
⏰ 時間：${new Date().toLocaleString('zh-TW')}

如問題持續，請聯繫管理員。`;
}

/**
 * 格式化系統狀態訊息
 */
export function formatSystemStatus(
  isHealthy: boolean,
  uptime?: number,
  activeSignals?: number
): string {
  const statusEmoji = isHealthy ? '✅' : '❌';
  const status = isHealthy ? '正常運行' : '異常';
  
  let message = `${statusEmoji} 系統狀態 ${statusEmoji}\n\n`;
  message += `🤖 機器人：${status}\n`;
  message += `📊 策略：Vegas Tunnel\n`;
  
  if (activeSignals !== undefined) {
    message += `🔔 活躍信號：${activeSignals} 個\n`;
  }
  
  if (uptime !== undefined) {
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    message += `⏱️ 運行時間：${hours}小時 ${minutes}分鐘\n`;
  }
  
  message += `⏰ 檢查時間：${new Date().toLocaleString('zh-TW')}`;
  
  return message;
}
import { CandleData, TechnicalIndicators, VegasTunnelSignal } from './types';

/**
 * 計算 EMA (指數移動平均)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0 || period <= 0) return [];
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // 第一個值使用 SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, prices.length); i++) {
    sum += prices[i];
  }
  ema[0] = sum / Math.min(period, prices.length);
  
  // 後續值使用 EMA 公式
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
  }
  
  return ema;
}

/**
 * 根據 K 線數據計算技術指標
 */
export function calculateIndicators(candles: CandleData[]): TechnicalIndicators | null {
  if (candles.length < 676) {
    return null; // 需要足夠的數據來計算 EMA676
  }
  
  const closes = candles.map(c => c.close);
  
  const ema12 = calculateEMA(closes, 12);
  const ema144 = calculateEMA(closes, 144);
  const ema169 = calculateEMA(closes, 169);
  const ema576 = calculateEMA(closes, 576);
  const ema676 = calculateEMA(closes, 676);
  
  const lastIndex = closes.length - 1;
  
  return {
    ema12: ema12[lastIndex],
    ema144: ema144[lastIndex],
    ema169: ema169[lastIndex],
    ema576: ema576[lastIndex],
    ema676: ema676[lastIndex]
  };
}

/**
 * Vegas Tunnel 策略邏輯
 */
export class VegasTunnel {
  private state = 0; // 0: 無狀態, 1: 等待信號
  private longShort = 0; // 0: 無方向, 1: 多頭排列, 2: 空頭排列
  
  analyzeSignal(candles: CandleData[]): VegasTunnelSignal | null {
    if (candles.length < 676) return null;
    
    const indicators = calculateIndicators(candles);
    if (!indicators) return null;
    
    const currentCandle = candles[candles.length - 1];
    const { ema12, ema144, ema169, ema576, ema676 } = indicators;
    
    // 判斷多空排列
    if (ema12 > ema144 && ema144 > ema169 && ema169 > ema576 && ema576 > ema676) {
      this.longShort = 1; // 多頭排列
    } else if (ema12 < ema144 && ema144 < ema169 && ema169 < ema576 && ema576 < ema676) {
      this.longShort = 2; // 空頭排列
    } else {
      this.longShort = 0; // 無明確方向
    }
    
    let signalType: 'long' | 'short' | 'none' = 'none';
    
    if (this.longShort === 0) {
      this.state = 0;
    } else if (this.longShort === 1) {
      // 多頭排列時的多頭信號邏輯
      if (this.state === 0) {
        if (currentCandle.low <= ema144 && currentCandle.close >= ema12) {
          signalType = 'long';
          this.state = 0;
        } else if (currentCandle.low <= ema144) {
          this.state = 1;
        } else {
          this.state = 0;
        }
      } else if (this.state === 1) {
        if (currentCandle.close >= ema12) {
          signalType = 'long';
          this.state = 0;
        } else if (ema12 <= ema144) {
          this.state = 0;
        }
      }
    } else if (this.longShort === 2) {
      // 空頭排列時的空頭信號邏輯
      if (this.state === 0) {
        if (currentCandle.high >= ema144 && currentCandle.close <= ema12) {
          signalType = 'short';
          this.state = 0;
        } else if (currentCandle.high >= ema144) {
          this.state = 1;
        } else {
          this.state = 0;
        }
      } else if (this.state === 1) {
        if (currentCandle.close <= ema12) {
          signalType = 'short';
          this.state = 0;
        } else if (ema12 >= ema144) {
          this.state = 0;
        }
      }
    }
    
    return {
      type: signalType,
      price: currentCandle.close,
      timestamp: currentCandle.timestamp,
      indicators
    };
  }
}

/**
 * 計算 Fibonacci 止盈位
 */
export function calculateFibonacciTargets(
  entryPrice: number, 
  direction: 'long' | 'short',
  swingHigh?: number,
  swingLow?: number
): { target1: number; target2: number; target3: number } {
  
  // 如果沒有提供擺動高低點，使用默認百分比
  const defaultPercent = 0.05; // 5%
  
  if (direction === 'long') {
    const baseRange = swingHigh && swingLow ? 
      Math.abs(swingHigh - swingLow) : 
      entryPrice * defaultPercent;
    
    return {
      target1: entryPrice + (baseRange * 1.0),    // Fibo 1.0
      target2: entryPrice + (baseRange * 1.618),  // Fibo 1.618
      target3: entryPrice + (baseRange * 2.0)     // Fibo 2.0
    };
  } else {
    const baseRange = swingHigh && swingLow ? 
      Math.abs(swingHigh - swingLow) : 
      entryPrice * defaultPercent;
    
    return {
      target1: entryPrice - (baseRange * 1.0),    // Fibo 1.0
      target2: entryPrice - (baseRange * 1.618),  // Fibo 1.618
      target3: entryPrice - (baseRange * 2.0)     // Fibo 2.0
    };
  }
}
// LINE Bot 和技術分析相關的類型定義

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  ema12: number;
  ema144: number;
  ema169: number;
  ema576: number;
  ema676: number;
}

export interface VegasTunnelSignal {
  type: 'long' | 'short' | 'none';
  price: number;
  timestamp: number;
  indicators: TechnicalIndicators;
}

export interface TradingSignal {
  symbol: string;
  direction: 'long' | 'short';
  timeframe: string;
  leverage: number;
  entryPrice: number;
  targets: {
    target1: number; // Fibo 1.0
    target2: number; // Fibo 1.618  
    target3: number; // Fibo 2.0
  };
  timestamp: number;
}

export interface LineWebhookEvent {
  type: string;
  source: {
    userId: string;
    type: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type: string;
    text: string;
  };
  replyToken?: string;
}

export interface LineMessage {
  type: 'text';
  text: string;
}
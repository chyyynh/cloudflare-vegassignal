import { LineBot } from './line-bot';
import { VegasTunnel, calculateFibonacciTargets } from './technical-analysis';
import { fetchKlineData, normalizeSymbol, SYMBOL_MAPPING } from './price-data';
import { formatTradingSignal, formatErrorMessage, formatSystemStatus } from './signal-formatter';
import { TradingSignal, LineWebhookEvent } from './types';

interface Env {
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  CHAT_STORAGE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS 設置
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Line-Signature',
    };

    // 處理 OPTIONS 請求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // LINE Bot webhook 處理
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return await handleLineWebhook(request, env);
      }

      // 手動觸發信號分析
      if (url.pathname === '/analyze' && request.method === 'POST') {
        return await handleAnalyzeRequest(request, env);
      }

      // 獲取系統狀態
      if (url.pathname === '/status' && request.method === 'GET') {
        return await handleStatusRequest(env);
      }

      // 獲取信號觸發價格
      if (url.pathname === '/trigger-price' && request.method === 'POST') {
        return await handleTriggerPriceRequest(request);
      }

      // 測試端點
      if (url.pathname === '/test' && request.method === 'GET') {
        return new Response(
          JSON.stringify({
            message: 'LINE Bot 報單機器人運行正常',
            timestamp: new Date().toISOString(),
            features: [
              'Vegas Tunnel 技術分析',
              'LINE Bot 整合',
              '多幣種支援',
              'Fibonacci 止盈計算'
            ]
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        );
      }

      // 預設回應
      return new Response(
        JSON.stringify({
          message: 'LINE Bot 報單機器人',
          version: '1.0.0',
          endpoints: {
            webhook: '/webhook (POST)',
            analyze: '/analyze (POST)',
            status: '/status (GET)',
            'trigger-price': '/trigger-price (POST)',
            test: '/test (GET)'
          }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }
  },

  // 定期執行的任務 (Cron Trigger)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      // 分析主要加密貨幣
      const symbols = ['BTC', 'ETH', 'BNB', 'SOL'];
      const lineBot = new LineBot(env.LINE_CHANNEL_ACCESS_TOKEN, env.LINE_CHANNEL_SECRET, env.CHAT_STORAGE);

      for (const symbol of symbols) {
        try {
          const signal = await analyzeSymbol(symbol);
          if (signal) {
            await lineBot.sendTradingSignal(signal);
            console.log(`發送 ${symbol} 交易信號:`, signal.direction);
          }
        } catch (error) {
          console.error(`分析 ${symbol} 失敗:`, error);
        }
      }
    } catch (error) {
      console.error('定期任務執行失敗:', error);
    }
  }
} satisfies ExportedHandler<Env>;

/**
 * 處理 LINE webhook
 */
async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const signature = request.headers.get('x-line-signature');
    const body = await request.text();
    const lineBot = new LineBot(env.LINE_CHANNEL_ACCESS_TOKEN, env.LINE_CHANNEL_SECRET, env.CHAT_STORAGE);
    
    // 開發模式下可選跳過簽名驗證
    if (env.NODE_ENV === 'development') {
      console.log('開發模式：跳過簽名驗證');
    } else {
      if (!signature) {
        return new Response('Missing signature', { status: 400 });
      }
      
      // 驗證簽名
      const isValid = await lineBot.verifySignature(body, signature);
      if (!isValid) {
        console.error('簽名驗證失敗');
        return new Response('Invalid signature', { status: 403 });
      }
    }

    const data = JSON.parse(body);
    const events: LineWebhookEvent[] = data.events || [];

    for (const event of events) {
      if (event.replyToken) {
        const replyMessages = await lineBot.handleWebhookEvent(event);
        if (replyMessages) {
          // 檢查是否是價格查詢請求
          const text = event.message?.text?.toLowerCase();
          if (text && (text.includes('price') || text.includes('價格'))) {
            // 先發送 "查詢中" 訊息
            await lineBot.replyMessage(event.replyToken, replyMessages);
            
            // 解析幣種
            const words = text.split(' ');
            let symbol = 'BTC';
            for (const word of words) {
              const upperWord = word.toUpperCase();
              if (['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'DOGE', 'AVAX', 'LINK'].includes(upperWord)) {
                symbol = upperWord;
                break;
              }
            }
            
            // 獲取觸發價格資訊
            try {
              const triggerInfo = await calculateTriggerPrice(symbol, '1h');
              const message = formatTriggerPriceMessage(symbol, triggerInfo);
              
              // 根據來源決定回覆方式
              if (event.source.type === 'group' || event.source.type === 'room') {
                // 群組或聊天室：直接在群組回覆
                await lineBot.pushMessage(event.source.groupId || event.source.roomId || event.source.userId, [{
                  type: 'text',
                  text: message
                }]);
              } else {
                // 個人聊天：回覆給用戶
                await lineBot.pushMessage(event.source.userId, [{
                  type: 'text',
                  text: message
                }]);
              }
            } catch (error) {
              const errorMessage = `❌ 查詢 ${symbol} 失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
              
              // 錯誤訊息也在相同地方回覆
              if (event.source.type === 'group' || event.source.type === 'room') {
                await lineBot.pushMessage(event.source.groupId || event.source.roomId || event.source.userId, [{
                  type: 'text',
                  text: errorMessage
                }]);
              } else {
                await lineBot.pushMessage(event.source.userId, [{
                  type: 'text',
                  text: errorMessage
                }]);
              }
            }
          } else {
            await lineBot.replyMessage(event.replyToken, replyMessages);
          }
        }
      }
    }

    return new Response('OK');
  } catch (error) {
    console.error('Webhook 處理失敗:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * 處理手動分析請求
 */
async function handleAnalyzeRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { 
      symbol?: string; 
      timeframe?: string; 
      userId?: string 
    };
    
    const symbol = body.symbol || 'BTC';
    const timeframe = body.timeframe || '1h';
    
    const signal = await analyzeSymbol(symbol, timeframe);
    
    if (signal) {
      // 如果提供了 userId，發送給特定用戶
      if (body.userId) {
        const lineBot = new LineBot(env.LINE_CHANNEL_ACCESS_TOKEN, env.LINE_CHANNEL_SECRET, env.CHAT_STORAGE);
        await lineBot.sendTradingSignal(signal, body.userId);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          signal,
          formattedMessage: formatTradingSignal(signal)
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: `${symbol} 目前沒有交易信號`
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error('分析請求處理失敗:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 處理狀態請求
 */
async function handleStatusRequest(env: Env): Promise<Response> {
  try {
    const status = formatSystemStatus(true, undefined, 0);
    
    return new Response(
      JSON.stringify({
        healthy: true,
        message: status,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 處理觸發價格請求
 */
async function handleTriggerPriceRequest(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { 
      symbol?: string; 
      timeframe?: string; 
    };
    
    const symbol = body.symbol || 'BTC';
    const timeframe = body.timeframe || '1h';
    
    const triggerInfo = await calculateTriggerPrice(symbol, timeframe);
    
    return new Response(
      JSON.stringify({
        success: true,
        symbol,
        timeframe,
        ...triggerInfo
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('觸發價格請求處理失敗:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 計算觸發信號的價格範圍
 */
async function calculateTriggerPrice(
  symbol: string, 
  timeframe: string = '1h'
): Promise<{
  currentPrice: number;
  indicators: any;
  triggerConditions: {
    longSignalPrice?: number;
    shortSignalPrice?: number;
    explanation: string;
  };
}> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const mapping = SYMBOL_MAPPING[normalizedSymbol as keyof typeof SYMBOL_MAPPING];
  
  if (!mapping) {
    throw new Error(`不支援的幣種: ${symbol}`);
  }

  // 獲取 K 線數據
  const candles = await fetchKlineData(mapping.binance, timeframe, 1000);
  const currentPrice = candles[candles.length - 1].close;
  
  // 計算技術指標
  const vegasTunnel = new VegasTunnel();
  const vegasSignal = vegasTunnel.analyzeSignal(candles);
  
  if (!vegasSignal) {
    return {
      currentPrice,
      indicators: null,
      triggerConditions: {
        explanation: '數據不足，無法計算觸發條件'
      }
    };
  }

  const { indicators } = vegasSignal;
  const { ema12, ema144, ema169, ema576, ema676 } = indicators;
  
  // 判斷多空排列
  const isLongAlignment = ema12 > ema144 && ema144 > ema169 && ema169 > ema576 && ema576 > ema676;
  const isShortAlignment = ema12 < ema144 && ema144 < ema169 && ema169 < ema576 && ema576 < ema676;
  
  let explanation = '';
  let longSignalPrice: number | undefined;
  let shortSignalPrice: number | undefined;
  
  if (isLongAlignment) {
    // 多頭排列：等待價格回測 EMA144 後反彈
    longSignalPrice = ema144;
    explanation = `多頭排列中。當價格回測至 EMA144 (${ema144.toFixed(4)}) 後反彈至 EMA12 (${ema12.toFixed(4)}) 以上時將觸發多頭信號。`;
  } else if (isShortAlignment) {
    // 空頭排列：等待價格反彈 EMA144 後下跌
    shortSignalPrice = ema144;
    explanation = `空頭排列中。當價格反彈至 EMA144 (${ema144.toFixed(4)}) 後下跌至 EMA12 (${ema12.toFixed(4)}) 以下時將觸發空頭信號。`;
  } else {
    explanation = `目前無明確多空排列。需要等待 EMA 線形成順序排列：
多頭排列：EMA12 > EMA144 > EMA169 > EMA576 > EMA676
空頭排列：EMA12 < EMA144 < EMA169 < EMA576 < EMA676

當前 EMA 值：
EMA12: ${ema12.toFixed(4)}
EMA144: ${ema144.toFixed(4)}
EMA169: ${ema169.toFixed(4)}
EMA576: ${ema576.toFixed(4)}
EMA676: ${ema676.toFixed(4)}`;
  }
  
  return {
    currentPrice,
    indicators: {
      ema12: ema12.toFixed(4),
      ema144: ema144.toFixed(4),
      ema169: ema169.toFixed(4),
      ema576: ema576.toFixed(4),
      ema676: ema676.toFixed(4),
      alignment: isLongAlignment ? 'long' : isShortAlignment ? 'short' : 'none'
    },
    triggerConditions: {
      longSignalPrice,
      shortSignalPrice,
      explanation
    }
  };
}

/**
 * 格式化觸發價格訊息
 */
function formatTriggerPriceMessage(symbol: string, triggerInfo: any): string {
  const { currentPrice, indicators, triggerConditions } = triggerInfo;
  
  let message = `📊 ${symbol} 觸發價格分析\n\n`;
  message += `💰 當前價格：$${currentPrice.toLocaleString()}\n\n`;
  
  if (indicators) {
    message += `📈 EMA 指標：\n`;
    message += `• EMA12: $${parseFloat(indicators.ema12).toLocaleString()}\n`;
    message += `• EMA144: $${parseFloat(indicators.ema144).toLocaleString()}\n`;
    message += `• EMA169: $${parseFloat(indicators.ema169).toLocaleString()}\n`;
    message += `• EMA576: $${parseFloat(indicators.ema576).toLocaleString()}\n`;
    message += `• EMA676: $${parseFloat(indicators.ema676).toLocaleString()}\n\n`;
    
    const alignment = indicators.alignment === 'long' ? '多頭排列' : 
                     indicators.alignment === 'short' ? '空頭排列' : '無明確排列';
    message += `🎯 排列狀態：${alignment}\n\n`;
  }
  
  message += `⚡ 觸發條件：\n${triggerConditions.explanation}\n\n`;
  
  if (triggerConditions.longSignalPrice) {
    message += `🟢 多頭觸發價：$${triggerConditions.longSignalPrice.toLocaleString()}\n`;
  }
  
  if (triggerConditions.shortSignalPrice) {
    message += `🔴 空頭觸發價：$${triggerConditions.shortSignalPrice.toLocaleString()}\n`;
  }
  
  message += `\n⏰ 查詢時間：${new Date().toLocaleString('zh-TW')}`;
  
  return message;
}

/**
 * 分析特定幣種的交易信號
 */
async function analyzeSymbol(
  symbol: string, 
  timeframe: string = '1h',
  leverage: number = 10
): Promise<TradingSignal | null> {
  try {
    const normalizedSymbol = normalizeSymbol(symbol);
    const mapping = SYMBOL_MAPPING[normalizedSymbol as keyof typeof SYMBOL_MAPPING];
    
    if (!mapping) {
      throw new Error(`不支援的幣種: ${symbol}`);
    }

    // 獲取 K 線數據
    const candles = await fetchKlineData(mapping.binance, timeframe, 1000);
    
    // 進行技術分析
    const vegasTunnel = new VegasTunnel();
    const vegasSignal = vegasTunnel.analyzeSignal(candles);
    
    if (!vegasSignal || vegasSignal.type === 'none') {
      return null;
    }

    // 計算 Fibonacci 止盈位
    const recentCandles = candles.slice(-50); // 取最近50根K線尋找擺動點
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);

    const targets = calculateFibonacciTargets(
      vegasSignal.price,
      vegasSignal.type,
      swingHigh,
      swingLow
    );

    return {
      symbol: normalizedSymbol,
      direction: vegasSignal.type,
      timeframe,
      leverage,
      entryPrice: vegasSignal.price,
      targets,
      timestamp: vegasSignal.timestamp
    };
  } catch (error) {
    console.error(`分析 ${symbol} 失敗:`, error);
    return null;
  }
}

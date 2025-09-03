import { LineWebhookEvent, LineMessage, TradingSignal } from './types';
import { formatTradingSignal } from './signal-formatter';

/**
 * LINE Bot API 相關功能
 */
export class LineBot {
  private channelAccessToken: string;
  private channelSecret: string;
  private kv: KVNamespace;
  
  // 記憶體快取（提升性能）
  private static activeChatIds = new Set<string>();
  private static cacheLoaded = false;
  
  constructor(channelAccessToken: string, channelSecret: string, kv: KVNamespace) {
    this.channelAccessToken = channelAccessToken;
    this.channelSecret = channelSecret;
    this.kv = kv;
  }
  
  /**
   * 驗證 webhook 簽名
   */
  async verifySignature(body: string, signature: string): Promise<boolean> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.channelSecret);
      const bodyData = encoder.encode(body);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyData);
      const computedSignature = this.bufferToBase64(signatureBuffer);
      
      return signature === computedSignature;
    } catch (error) {
      console.error('簽名驗證失敗:', error);
      return false;
    }
  }
  
  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }
  
  /**
   * 回覆訊息
   */
  async replyMessage(replyToken: string, messages: LineMessage[]): Promise<Response> {
    const url = 'https://api.line.me/v2/bot/message/reply';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.channelAccessToken}`
      },
      body: JSON.stringify({
        replyToken,
        messages
      })
    });
    
    if (!response.ok) {
      throw new Error(`LINE API error: ${response.status}`);
    }
    
    return response;
  }
  
  /**
   * 推送訊息給用戶
   */
  async pushMessage(userId: string, messages: LineMessage[]): Promise<Response> {
    const url = 'https://api.line.me/v2/bot/message/push';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.channelAccessToken}`
      },
      body: JSON.stringify({
        to: userId,
        messages
      })
    });
    
    if (!response.ok) {
      throw new Error(`LINE API error: ${response.status}`);
    }
    
    return response;
  }
  
  /**
   * 群發訊息
   */
  async broadcastMessage(messages: LineMessage[]): Promise<Response> {
    const url = 'https://api.line.me/v2/bot/message/broadcast';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.channelAccessToken}`
      },
      body: JSON.stringify({
        messages
      })
    });
    
    if (!response.ok) {
      throw new Error(`LINE API error: ${response.status}`);
    }
    
    return response;
  }
  
  /**
   * 從 KV 載入聊天 ID 快取
   */
  private async loadChatIds(): Promise<void> {
    if (LineBot.cacheLoaded) return;
    
    try {
      const stored = await this.kv.get('activeChatIds');
      if (stored) {
        const chatIds = JSON.parse(stored) as string[];
        LineBot.activeChatIds = new Set(chatIds);
        console.log(`從 KV 載入 ${chatIds.length} 個聊天 ID`);
      }
      LineBot.cacheLoaded = true;
    } catch (error) {
      console.error('載入聊天 ID 失敗:', error);
    }
  }

  /**
   * 保存聊天 ID 到 KV
   */
  private async saveChatIds(): Promise<void> {
    try {
      const chatIds = Array.from(LineBot.activeChatIds);
      await this.kv.put('activeChatIds', JSON.stringify(chatIds));
      console.log(`保存 ${chatIds.length} 個聊天 ID 到 KV`);
    } catch (error) {
      console.error('保存聊天 ID 失敗:', error);
    }
  }

  /**
   * 添加聊天 ID 到活躍列表
   */
  async addActiveChatId(event: LineWebhookEvent): Promise<void> {
    // 確保已載入快取
    await this.loadChatIds();
    
    let chatId: string | null = null;
    
    if (event.source.type === 'group' && event.source.groupId) {
      chatId = event.source.groupId;
    } else if (event.source.type === 'room' && event.source.roomId) {
      chatId = event.source.roomId;
    } else if (event.source.userId) {
      chatId = event.source.userId;
    }
    
    if (chatId && !LineBot.activeChatIds.has(chatId)) {
      LineBot.activeChatIds.add(chatId);
      // 異步保存到 KV
      this.saveChatIds().catch(console.error);
      console.log(`新增聊天 ID: ${chatId}`);
    }
  }

  /**
   * 處理 webhook 事件
   */
  async handleWebhookEvent(event: LineWebhookEvent): Promise<LineMessage[] | null> {
    // 記錄活躍的聊天 ID
    await this.addActiveChatId(event);
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text.toLowerCase();
      
      if (text.includes('help') || text.includes('幫助')) {
        return [{
          type: 'text',
          text: `🤖 加密貨幣報單機器人使用說明：

📊 支援功能：
• 自動監控 Vegas Tunnel 策略信號
• 提供進場點位和止盈目標
• 支援多種加密貨幣 (BTC, ETH, BNB, SOL 等)

📝 指令：
• "status" - 查看機器人狀態
• "symbols" - 查看支援的交易對
• "price BTC" - 查看 BTC 觸發價格
• "help" - 顯示此說明

⚠️ 風險提醒：
本機器人提供的信號僅供參考，不構成投資建議。
投資有風險，請謹慎決策。`
        }];
      }
      
      if (text.includes('status') || text.includes('狀態')) {
        return [{
          type: 'text',
          text: `✅ 機器人運行正常\n⏰ 監控中: Vegas Tunnel 策略\n📈 支援交易對: BTC, ETH, BNB, SOL 等\n💬 活躍聊天: ${LineBot.activeChatIds.size} 個`
        }];
      }
      
      if (text.includes('symbols') || text.includes('交易對')) {
        return [{
          type: 'text',
          text: `📊 支援的交易對：
          
🔸 主流幣種：
• BTC/USDT (比特幣)
• ETH/USDT (以太坊)
• BNB/USDT (幣安幣)
• SOL/USDT (Solana)

🔸 熱門幣種：
• ADA/USDT (Cardano)
• XRP/USDT (Ripple)
• DOT/USDT (Polkadot)
• DOGE/USDT (狗狗幣)
• AVAX/USDT (Avalanche)
• LINK/USDT (Chainlink)`
        }];
      }
      
      // 處理價格查詢指令 "price BTC" 或 "價格 BTC"
      if (text.includes('price') || text.includes('價格')) {
        const words = text.split(' ');
        let symbol = 'BTC'; // 預設
        
        // 尋找幣種符號
        for (const word of words) {
          const upperWord = word.toUpperCase();
          if (['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'DOGE', 'AVAX', 'LINK'].includes(upperWord)) {
            symbol = upperWord;
            break;
          }
        }
        
        return [{
          type: 'text',
          text: `🔍 正在查詢 ${symbol} 觸發條件...`
        }];
      }
    }
    
    return null;
  }
  
  /**
   * 發送交易信號到所有活躍聊天
   */
  async sendTradingSignal(signal: TradingSignal, specificChatId?: string): Promise<void> {
    // 確保載入 KV 數據
    await this.loadChatIds();
    
    const message: LineMessage = {
      type: 'text',
      text: formatTradingSignal(signal)
    };
    
    try {
      if (specificChatId) {
        // 發送給特定聊天
        await this.pushMessage(specificChatId, [message]);
      } else {
        // 發送給所有活躍聊天
        console.log(`發送交易信號給 ${LineBot.activeChatIds.size} 個聊天`);
        
        const sendPromises: Promise<Response>[] = [];
        const failedChatIds: string[] = [];
        
        for (const chatId of LineBot.activeChatIds) {
          sendPromises.push(
            this.pushMessage(chatId, [message]).catch(error => {
              console.warn(`發送到 ${chatId} 失敗:`, error);
              // 記錄失敗的聊天 ID
              failedChatIds.push(chatId);
              return new Response('Error', { status: 500 });
            })
          );
        }
        
        await Promise.allSettled(sendPromises);
        
        // 批量移除失敗的聊天 ID 並更新 KV
        if (failedChatIds.length > 0) {
          failedChatIds.forEach(chatId => LineBot.activeChatIds.delete(chatId));
          console.log(`移除 ${failedChatIds.length} 個無效聊天 ID`);
          // 異步更新 KV
          this.saveChatIds().catch(console.error);
        }
      }
    } catch (error) {
      console.error('發送交易信號失敗:', error);
      throw error;
    }
  }
  
  /**
   * 獲取活躍聊天數量（用於調試）
   */
  getActiveChatCount(): number {
    return LineBot.activeChatIds.size;
  }
}
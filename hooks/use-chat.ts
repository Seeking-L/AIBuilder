import { useState, useCallback } from 'react';
import { sendMessage } from '@/lib/api';

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface UseChatReturn {
  messages: Message[];
  loading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Chat Hook - 管理对话状态和逻辑
 */
export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * 发送消息
   */
  const handleSendMessage = useCallback(async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || loading) {
      return;
    }

    // 添加用户消息
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmedText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      // 调用 API 获取 AI 回复
      const reply = await sendMessage(trimmedText);

      // 添加 AI 消息
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      // 错误处理：添加错误消息
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: '抱歉，发送消息时出现了错误，请稍后重试。',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  /**
   * 清空消息
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    loading,
    sendMessage: handleSendMessage,
    clearMessages,
  };
}

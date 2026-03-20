import { useCallback, useEffect, useMemo } from 'react';

import type { ConversationMessage } from '@/lib/api';

import { useConversationMessages } from '@/hooks/use-conversation-messages';
import { useConversationRun } from '@/hooks/use-conversation-run';

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
 * Chat Hook（多对话窗口版本）
 *
 * 该 hook 的职责调整为：
 * - 消息历史：来自后端 `GET /conversations/{conversationId}/messages`
 * - 发送消息：通过后端触发 run（`POST /conversations/{conversationId}/messages`）
 * - WS 推送：由 `useConversationRun` 负责；本 hook 在 run 结束后自动 reload messages
 */
export function useChat(
  conversationId: string | null,
): UseChatReturn {
  const { messages: conversationMessages, loading: messagesLoading, reload } =
    useConversationMessages(conversationId);
  const { wsStatus, send, error } = useConversationRun(conversationId);

  // 只把 user/assistant 映射成聊天气泡；tool 消息通常用于调试/终端渲染，本聊天 UI 先隐藏。
  const messages = useMemo((): Message[] => {
    const filtered = conversationMessages.filter(
      (m: ConversationMessage): m is ConversationMessage & { role: MessageRole } =>
        m.role === 'user' || m.role === 'assistant',
    );

    // 后端 messages 当前类型未提供稳定 message id，因此用 index 生成可用 key。
    return filtered.map((m, index) => ({
      id: `${conversationId ?? 'no-conv'}-${index}-${m.role}`,
      role: m.role,
      content: m.content,
      timestamp: index, // 用 index 提供稳定但无需严格意义的 timestamp
    }));
  }, [conversationId, conversationMessages]);

  // 如果 run 正在执行，或者消息正在重新拉取，则认为整体处于 loading。
  const loading = messagesLoading || wsStatus === 'running';

  useEffect(() => {
    // run 结束后重新拉取 messages，确保切换 conversation/刷新后消息一致
    if (wsStatus === 'completed' || wsStatus === 'failed') {
      void reload();
    }
  }, [reload, wsStatus]);

  const sendMessage = useCallback(
    async (text: string) => {
      // error 变量目前不直接展示，由上层 UI 决策；这里确保 send 不因为空 conversationId 崩溃
      void error;
      await send(text);
    },
    [error, send],
  );

  const clearMessages = useCallback(() => {
    // 后端没有“删除对话消息”的接口时，clear 的最佳可行实现是重新加载历史
    void reload();
  }, [reload]);

  return {
    messages,
    loading,
    sendMessage,
    clearMessages,
  };
}

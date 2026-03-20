import { useCallback, useEffect, useState } from 'react';

import type { ConversationMessage } from '@/lib/api';
import { getConversationMessages } from '@/lib/api';

export interface UseConversationMessagesReturn {
  title: string | null;
  messages: ConversationMessage[];
  loading: boolean;
  error: string | null;

  /**
   * 手动重新拉取当前 conversation messages。
   * （例如：run 完成后希望刷新历史）
   */
  reload: () => Promise<void>;
}

export function useConversationMessages(
  conversationId: string | null,
): UseConversationMessagesReturn {
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 当 conversationId 发生切换时：
   * - 立刻清空旧的 title/messages，避免在新会话拉取完成之前仍短暂展示旧对话内容；
   * - 然后依赖下面的 `reload()` effect 触发重新拉取。
   */
  useEffect(() => {
    setTitle(null);
    setMessages([]);
    setError(null);
    // 注意：这里不直接 setLoading(true)，由 reload() 负责设置 loading 状态。
  }, [conversationId]);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setTitle(null);
      setMessages([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await getConversationMessages(conversationId);
      setTitle(res.title ?? null);
      // 后端按顺序返回 messages，前端只负责按 role 渲染
      setMessages(res.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    // activeConversationId 改变时拉取对应历史消息
    void reload();
  }, [reload]);

  return {
    title,
    messages,
    loading,
    error,
    reload,
  };
}


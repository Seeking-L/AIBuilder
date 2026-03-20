import { useCallback, useEffect, useState } from 'react';

import type {
  ConversationSummary,
  CreateConversationResponse,
} from '@/lib/api';
import { createConversation as createConversationApi, listConversations } from '@/lib/api';

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  error: string | null;

  /**
   * 创建一个新 conversation，并自动切到该 conversation。
   */
  createConversation: () => Promise<void>;

  /**
   * 外部在切 Tab 时调用，用于切换 activeConversationId。
   */
  setActiveConversationId: (conversationId: string) => void;

  /**
   * 重新拉取 conversation 列表（例如下拉刷新或页面重新进入）。
   */
  refresh: () => Promise<void>;
}

/**
 * 从 conversation summary 中提取“用于判断最新”的时间戳。
 *
 * - 优先使用 `updatedAt`，其次使用 `createdAt`
 * - 若字段缺失或无法解析，返回 `null`，让上层走兜底逻辑
 */
function getConversationTime(c: ConversationSummary): number | null {
  const updatedAt = c.updatedAt ? Date.parse(c.updatedAt) : NaN;
  const createdAt = c.createdAt ? Date.parse(c.createdAt) : NaN;
  const t = Number.isFinite(updatedAt) ? updatedAt : createdAt;
  return Number.isFinite(t) ? t : null;
}

/**
 * 依据时间戳从列表里挑选“最新”的 conversation。
 * 时间戳不可用时，回退到后端返回顺序（数组第一个）。
 */
function pickLatestConversation(conversations: ConversationSummary[]): ConversationSummary | null {
  if (!conversations.length) return null;

  const withTime = conversations
    .map((c) => {
      const t = getConversationTime(c);
      return t === null ? null : { c, t };
    })
    .filter(Boolean) as Array<{ c: ConversationSummary; t: number }>;

  if (withTime.length === 0) {
    // 无法解析时间戳：使用后端返回顺序的第一个
    return conversations[0];
  }

  withTime.sort((a, b) => b.t - a.t);
  return withTime[0]?.c ?? conversations[0];
}

function toConversationSummary(
  res: CreateConversationResponse,
): ConversationSummary {
  // 后端创建响应包含 expoRoot，但此 hook 只负责 Tabbar 需要的字段
  return {
    conversationId: res.conversationId,
    title: res.title,
  };
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listConversations();
      const nextConversations = res.conversations ?? [];

      setConversations(nextConversations);
      setActiveConversationIdState((prev) => {
        // 如果当前 active 仍存在于新列表中，保持不变；否则切到第一个
        if (prev && nextConversations.some((c) => c.conversationId === prev)) {
          return prev;
        }

        // 当 prev 不可保留（比如被删除/列表重新加载）时，
        // 按 updatedAt/createdAt 选择“最新”的 conversation。
        const latest = pickLatestConversation(nextConversations);
        return latest?.conversationId ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 组件挂载即拉取会话列表
    void refresh();
  }, [refresh]);

  const createConversation = useCallback(async () => {
    setError(null);
    // 创建期间也可复用 loading（简单处理）；如需更细分可后续拆 separate state
    setLoading(true);

    try {
      const res = await createConversationApi();
      const newSummary = toConversationSummary(res);

      setConversations((prev) => [...prev, newSummary]);
      setActiveConversationIdState(newSummary.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create conversation');
    } finally {
      setLoading(false);
    }
  }, []);

  const setActiveConversationId = useCallback((conversationId: string) => {
    setActiveConversationIdState(conversationId);
  }, []);

  return {
    conversations,
    activeConversationId,
    loading,
    error,
    createConversation,
    setActiveConversationId,
    refresh,
  };
}


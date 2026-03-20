import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentEvent, SendMessageRequest, TaskStatusMessage } from '@/lib/api';
import {
  buildConversationWsUrl,
  sendConversationMessage,
} from '@/lib/api';

export type WsStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface UseConversationRunReturn {
  wsStatus: WsStatus;
  events: AgentEvent[];
  runId: string | null;
  error: string | null;
  /**
   * 当后端通过 tool -> WS 推送到 `type === "expo_url_ready"` 或
   * `type === "task_status"`(completed) 并携带 `expoUrl` 时，这里保存可直接打开的 `exp://...` 链接。
   */
  expoUrl: string | null;

  /**
   * 当前对话的最大 stepId（用于断线重连的 lastStepId）。
   * 此处先实现“维护值”，重连在下一阶段再加强。
   */
  lastStepId: number;

  /**
   * 向当前 conversation 发送消息：会触发一次 run，并通过 WS 实时接收事件。
   */
  send: (text: string, framework?: string, optionalTitle?: string) => Promise<void>;

  /**
   * 主动关闭 WS，并把状态重置为 idle。
   * 注意：后端的 run 可能仍在运行（取决于后端是否支持取消）。
   */
  close: () => void;
}

export function useConversationRun(
  conversationId: string | null,
): UseConversationRunReturn {
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expoUrl, setExpoUrl] = useState<string | null>(null);
  const [lastStepId, setLastStepId] = useState<number>(0);
  /**
   * 更精细的断线重连游标：由后端在每条 WebSocket 消息中附带 `eventSeq`。
   *
   * 该字段用于解决“同一步 step 内多条 command 消息漏推送”的问题：
   * 如果仅靠 lastStepId 回放，可能会漏掉紧邻事件里 stepId 相近/复用的后续输出。
   */
  const [lastEventSeq, setLastEventSeq] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  /**
   * 断线重连相关状态用 ref 保存，避免因闭包/状态更新导致 onclose 时拿到旧值。
   */
  const hasFinishedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const lastStepIdRef = useRef(0);
  const lastEventSeqRef = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  const expoUrlRef = useRef<string | null>(null);

  /**
   * 从后端 WS 消息中维护游标：
   * - `lastStepId`：最大 stepId
   * - `lastEventSeq`：最大 eventSeq
   *
   * 这里同时维护 state 和 ref：
   * - state 方便渲染/调试
   * - ref 供 onclose/onmessage 的闭包读取，避免状态异步造成的游标过期
   */
  const updateCursorsFromWsMessage = (msg: any) => {
    const maybeStepId = msg?.stepId;
    if (typeof maybeStepId === 'number' && Number.isFinite(maybeStepId)) {
      setLastStepId((prev) => {
        const next = Math.max(prev, maybeStepId);
        lastStepIdRef.current = next;
        return next;
      });
    }

    const maybeEventSeq = msg?.eventSeq;
    if (
      typeof maybeEventSeq === 'number' &&
      Number.isFinite(maybeEventSeq)
    ) {
      setLastEventSeq((prev) => {
        const prevVal =
          typeof prev === 'number' && Number.isFinite(prev) ? prev : maybeEventSeq;
        const next = Math.max(prevVal, maybeEventSeq);
        lastEventSeqRef.current = next;
        return next;
      });
    }
  };

  /**
   * 仅负责关闭当前 WS 连接，不改变 wsStatus/runId。
   * 主要用于收到 `task_status` 的结束事件：此时希望 UI 显示 completed/failed。
   */
  const closeWsOnly = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  /**
   * conversationId 切换时，立即重置“运行状态”和时间线事件，避免：
   * - 切到新 conversation 之前仍短暂显示旧事件/生成状态；
   * - 切换时旧 WS 继续触发 onclose/onmessage 导致 UI 串台。
   */
  useEffect(() => {
    // 标记为“结束”，避免 close 引发 onclose 时触发重连逻辑
    hasFinishedRef.current = true;
    reconnectAttemptsRef.current = 0;

    isUnmountingRef.current = false;

    // 关闭旧 WS（如果存在）
    closeWsOnly();

    // 清空 UI 侧运行状态
    setWsStatus('idle');
    setEvents([]);
    setRunId(null);
    setError(null);
    setExpoUrl(null);
    setLastStepId(0);
    setLastEventSeq(null);

    // 同步更新 ref，保证未来的重连逻辑使用正确的初始值
    runIdRef.current = null;
    expoUrlRef.current = null;
    lastStepIdRef.current = 0;
    lastEventSeqRef.current = null;
  }, [conversationId, closeWsOnly]);

  const close = useCallback(() => {
    // 主动关闭时禁止重连：因为这通常意味着用户切换/取消/卸载操作
    hasFinishedRef.current = true;
    reconnectAttemptsRef.current = 0;
    runIdRef.current = null;
    closeWsOnly();
    setWsStatus('idle');
    setRunId(null);
  }, []);

  useEffect(() => {
    // conversationId 切换/组件卸载时，务必清理旧 WS，避免多个对话同时推送导致状态串台
    return () => {
      isUnmountingRef.current = true;
      hasFinishedRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, []);

  const send = useCallback(
    async (text: string, framework?: string, optionalTitle?: string) => {
      if (!conversationId) {
        setError('conversationId is required');
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        setError('text is required');
        return;
      }

      // 如果当前已在运行，直接拒绝发送（并发控制在后端也有约束）
      if (wsStatus === 'running') {
        setError('A run is already running for this conversation');
        return;
      }

      setError(null);
      setEvents([]);
      setWsStatus('running');
      setExpoUrl(null);
      expoUrlRef.current = null;
      setLastStepId(0);
      setLastEventSeq(null);
      // 初始化断线重连状态
      isUnmountingRef.current = false;
      hasFinishedRef.current = false;
      reconnectAttemptsRef.current = 0;
      lastStepIdRef.current = 0;
      lastEventSeqRef.current = null;
      runIdRef.current = null;

      try {
        const payload: SendMessageRequest = {
          text: trimmed,
          framework: framework?.trim() || undefined,
          optionalTitle: optionalTitle?.trim() || undefined,
        };

        // 1) 先发 HTTP：拿到 runId
        const res = await sendConversationMessage(conversationId, payload);
        setRunId(res.runId);
        runIdRef.current = res.runId;

        // 2) 再连 WS：订阅该 run 的 AgentEvent
        const wsUrl = buildConversationWsUrl(conversationId, res.runId);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as AgentEvent | TaskStatusMessage;
            // 逐条打印 WS 增量消息：用于确认后端是否真的推送了 command_output 等事件
            // （也是用来判断“前端过滤/漏渲染”还是“后端没推送/写 stdin 没成功”）
            const msgAny = data as any;
            console.log('[ws-msg]', {
              type: msgAny?.type,
              stepId: msgAny?.stepId,
              eventSeq: msgAny?.eventSeq,
              title: msgAny?.title,
              detail: msgAny?.detail,
            });

            // 无论是 task_status 还是 AgentEvent，先维护游标（有则更新，无则跳过）
            updateCursorsFromWsMessage(msgAny);

            // 后端结束时会推送一个 TaskStatusMessage
            if ((data as TaskStatusMessage).type === 'task_status') {
              const msg = data as TaskStatusMessage;
              hasFinishedRef.current = true;
              setWsStatus(msg.status === 'completed' ? 'completed' : 'failed');
              if (msg.error) setError(msg.error);

              // completed 兜底：处理断线重连/事件漏收导致的 expoUrl 缺失
              if (
                msg.status === 'completed' &&
                msg.expoUrl &&
                !expoUrlRef.current &&
                typeof msg.expoUrl === 'string'
              ) {
                const nextUrl = msg.expoUrl.trim();
                if (nextUrl.startsWith('exp://')) {
                  expoUrlRef.current = nextUrl;
                  setExpoUrl(nextUrl);
                }
              }

              // 关闭 WS，但不重置 wsStatus，确保 UI 能反映 finished 状态
              closeWsOnly();
              return;
            }

            const evt = data as AgentEvent;

            // expo_url_ready：只作为“可点击按钮”的数据来源，不进入 timeline events
            if (evt.type === 'expo_url_ready') {
              const nextUrl = (evt.detail ?? '').trim();
              // 仅在首次收到且 url 格式合法时写入，避免重复/错误覆盖
              if (
                nextUrl &&
                nextUrl.startsWith('exp://') &&
                !expoUrlRef.current
              ) {
                expoUrlRef.current = nextUrl;
                setExpoUrl(nextUrl);
              }
              return;
            }

            setEvents((prev) => [...prev, evt]);
          } catch {
            // 忽略非预期消息结构
          }
        };

        ws.onerror = () => {
          // 错误通常会伴随 onclose；不立即标记 failed，避免断线时抢救重连失败
          setError('WebSocket 连接异常，正在尝试重连...');
        };

        ws.onclose = () => {
          wsRef.current = null;

          // 已结束/卸载/没有 runId 时，不需要重连
          if (isUnmountingRef.current || hasFinishedRef.current) {
            return;
          }

          const MAX_RECONNECT_ATTEMPTS = 3;
          const currentRunId = runIdRef.current;
          const currentLastStepId = lastStepIdRef.current;
          const currentLastEventSeq = lastEventSeqRef.current ?? undefined;

          if (!currentRunId) {
            setWsStatus('failed');
            setError('WebSocket 断开但缺少 runId，无法重连');
            hasFinishedRef.current = true;
            return;
          }

          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setWsStatus('failed');
            setError('WebSocket 断开且重连失败');
            hasFinishedRef.current = true;
            return;
          }

          reconnectAttemptsRef.current += 1;

          // 继续订阅：后端会基于 lastStepId 只推送新增 stepId
          const nextWsUrl = buildConversationWsUrl(
            conversationId,
            currentRunId,
            currentLastStepId,
            currentLastEventSeq,
          );
          const nextWs = new WebSocket(nextWsUrl);
          wsRef.current = nextWs;

          nextWs.onmessage = (msgEvent) => {
            try {
              const data = JSON.parse(msgEvent.data) as AgentEvent | TaskStatusMessage;
              // 逐条打印 WS 增量消息（重连场景同样打印）
              const msgAny = data as any;
              console.log('[ws-msg]', {
                type: msgAny?.type,
                stepId: msgAny?.stepId,
                eventSeq: msgAny?.eventSeq,
                title: msgAny?.title,
                detail: msgAny?.detail,
              });

              // 先更新游标，再处理业务逻辑
              updateCursorsFromWsMessage(msgAny);

              if ((data as TaskStatusMessage).type === 'task_status') {
                const taskMsg = data as TaskStatusMessage;
                hasFinishedRef.current = true;
                setWsStatus(taskMsg.status === 'completed' ? 'completed' : 'failed');
                if (taskMsg.error) setError(taskMsg.error);

                if (
                  taskMsg.status === 'completed' &&
                  taskMsg.expoUrl &&
                  !expoUrlRef.current &&
                  typeof taskMsg.expoUrl === 'string'
                ) {
                  const nextUrl = taskMsg.expoUrl.trim();
                  if (nextUrl.startsWith('exp://')) {
                    expoUrlRef.current = nextUrl;
                    setExpoUrl(nextUrl);
                  }
                }

                closeWsOnly();
                return;
              }

              const evt = data as AgentEvent;

              if (evt.type === 'expo_url_ready') {
                const nextUrl = (evt.detail ?? '').trim();
                if (
                  nextUrl &&
                  nextUrl.startsWith('exp://') &&
                  !expoUrlRef.current
                ) {
                  expoUrlRef.current = nextUrl;
                  setExpoUrl(nextUrl);
                }
                return;
              }

              setEvents((prev) => [...prev, evt]);
            } catch {
              // ignore
            }
          };

          nextWs.onerror = () => {
            setError('WebSocket 重连失败，正在继续尝试...');
          };

          // 复用同一套重连逻辑：nextWs 再次断开时继续基于 lastStepId 增量补发
          nextWs.onclose = ws.onclose;
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to send message';

        // 并发约束：同一个 conversation 在同一时间只能有一个 running run。
        // 后端返回：detail: "A run is already running for this conversation"
        const isRunAlreadyRunning =
          message.includes('A run is already running for this conversation') ||
          message.toLowerCase().includes('run is already running');

        if (isRunAlreadyRunning) {
          // 不进入 failed 状态，避免用户误以为请求一定失败；
          // 同时保留错误文案让 UI 做“禁用发送 + 提示正在生成”的交互。
          hasFinishedRef.current = true;
          reconnectAttemptsRef.current = 0;
          setWsStatus('idle');
          setRunId(null);
          runIdRef.current = null;
          setError(message);
          return;
        }

        setWsStatus('failed');
        setError(message);
      }
    },
    [conversationId, wsStatus, closeWsOnly],
  );

  return {
    wsStatus,
    events,
    runId,
    error,
    expoUrl,
    lastStepId,
    send,
    close,
  };
}


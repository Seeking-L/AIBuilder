import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AgentEvent,
  type GenerateAppRequest,
  type StartGenerateAppResponse,
  type TaskStatusMessage,
  buildTaskWsUrl,
  startGenerateAppAsync,
} from '@/lib/api';

export type AsyncTaskStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed';

export interface UseGenerateAppAsyncReturn {
  taskId: string | null;
  status: AsyncTaskStatus;
  events: AgentEvent[];
  error: string | null;
  expoRoot: string | null;
  expoUrl: string | null;
  start: (description: string, framework?: string) => Promise<void>;
  cancel: () => void;
}

export function useGenerateAppAsync(): UseGenerateAppAsyncReturn {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<AsyncTaskStatus>('idle');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expoRoot, setExpoRoot] = useState<string | null>(null);
  const [expoUrl, setExpoUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (description: string, framework?: string) => {
      const trimmed = description.trim();
      if (!trimmed) {
        setError('description is required');
        return;
      }

      // 避免重复启动
      if (status === 'starting' || status === 'running') {
        return;
      }

      setStatus('starting');
      setError(null);
      setEvents([]);
      setExpoRoot(null);
      setExpoUrl(null);

      try {
        const payload: GenerateAppRequest = framework
          ? {
              description: trimmed,
              framework,
            }
          : {
              description: trimmed,
            };

        const res: StartGenerateAppResponse = await startGenerateAppAsync(
          payload,
        );

        setTaskId(res.taskId);
        setExpoRoot(res.expoRoot);
        setStatus('running');

        const wsUrl = buildTaskWsUrl(res.taskId);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as TaskStatusMessage | AgentEvent;

            if ((data as TaskStatusMessage).type === 'task_status') {
              const msg = data as TaskStatusMessage;
              setStatus(msg.status === 'completed' ? 'completed' : 'failed');
              if (msg.error) {
                setError(msg.error);
              }

              // completed 兜底：从 task_status 结束消息拿到可打开的 expoUrl（如果后端提供）
              if (msg.status === 'completed' && msg.expoUrl) {
                const nextUrl = msg.expoUrl.trim();
                if (nextUrl.startsWith('exp://')) {
                  setExpoUrl(nextUrl);
                }
              }

              closeWebSocket();
              return;
            }

            const evt = data as AgentEvent;

            // expo_url_ready：只作为按钮数据来源，不进入 timeline events
            if (evt.type === 'expo_url_ready') {
              const nextUrl = (evt.detail ?? '').trim();
              if (nextUrl && nextUrl.startsWith('exp://')) {
                setExpoUrl(nextUrl);
              }
              return;
            }

            setEvents((prev) => [...prev, evt]);
          } catch {
            // 忽略无法解析的消息
          }
        };

        ws.onerror = () => {
          setError('WebSocket 连接出错');
        };

        ws.onclose = () => {
          wsRef.current = null;
        };
      } catch (err) {
        setStatus('failed');
        const message =
          err instanceof Error ? err.message : '任务启动失败，请稍后重试';
        setError(message);
      }
    },
    [closeWebSocket, status],
  );

  const cancel = useCallback(() => {
    closeWebSocket();
    setStatus('idle');
    setTaskId(null);
    setExpoUrl(null);
  }, [closeWebSocket]);

  useEffect(() => {
    return () => {
      closeWebSocket();
    };
  }, [closeWebSocket]);

  return {
    taskId,
    status,
    events,
    error,
    expoRoot,
    expoUrl,
    start,
    cancel,
  };
}


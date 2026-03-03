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
  start: (description: string, framework?: string) => Promise<void>;
  cancel: () => void;
}

export function useGenerateAppAsync(): UseGenerateAppAsyncReturn {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<AsyncTaskStatus>('idle');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expoRoot, setExpoRoot] = useState<string | null>(null);

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
              closeWebSocket();
              return;
            }

            setEvents((prev) => [...prev, data as AgentEvent]);
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
    start,
    cancel,
  };
}


/**
 * API 服务层
 * 对接后端 /health 与 /tasks/generate-app 接口，
 * 同时保留现有的 mock 聊天能力。
 */

const USE_MOCK = false; // 切换开关：true 使用 mock，false 使用真实 API

/**
 * 后端基础地址
 * 优先使用环境变量 EXPO_PUBLIC_API_BASE_URL，未配置时默认 http://localhost:4000
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://172.19.8.35:4000';

/**
 * 接口类型定义
 */
export interface HealthResponse {
  status: string;
  workspaceRoot: string;
}

export interface GenerateAppRequest {
  description: string;
  framework?: string;
}

export type AgentEventType =
  | 'round_start'
  | 'llm_response'
  | 'tool_call'
  | 'tool_result'
  | 'finished';

export interface AgentEvent {
  stepId: number;
  type: AgentEventType;
  title: string;
  detail?: string | null;
}

export interface GenerateAppResponse {
  status: 'completed';
  description: string;
  framework: string;
  logs: string[];
  summary: string;
  taskId: string;
  expoRoot: string;
  expoUrl?: string | null;
  /**
   * AI 工作过程事件时间线。
   * 旧版本后端可能没有该字段，因此前端使用时需做空数组兜底。
   */
  events?: AgentEvent[];
}

export interface StartGenerateAppResponse {
  status: 'accepted';
  taskId: string;
  expoRoot: string;
}

export interface TaskStatusMessage {
  type: 'task_status';
  status: 'completed' | 'failed';
  error?: string | null;
}

/**
 * 模拟延迟（用于 mock）
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成 mock AI 回复
 */
function generateMockReply(userInput: string): string {
  const mockReplies = [
    `收到你的消息：「${userInput}」。这是一个模拟的 AI 回复。`,
    `你好！你发送了：「${userInput}」。当前后端还在开发中，这是预设的回复内容。`,
    `AI 助手已收到：「${userInput}」。开发完成后，这里将展示真实的 AI 回复。`,
    `理解你的输入：「${userInput}」。后端就绪后，将调用真实的 AI 服务。`,
    `这是关于「${userInput}」的回复。目前使用静态数据，后续将接入真实 AI 接口。`,
  ];

  // 根据输入长度选择一个回复（使回复看起来更有变化）
  const index = userInput.length % mockReplies.length;
  return mockReplies[index];
}

/**
 * 通用请求封装
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // 后端理论上总是返回 JSON，这里兜底以防万一
  }

  if (!response.ok) {
    const message =
      data?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

/**
 * 健康检查：GET /health
 */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health', {
    method: 'GET',
  });
}

/**
 * 生成应用任务：POST /tasks/generate-app
 */
export function generateApp(
  payload: GenerateAppRequest
): Promise<GenerateAppResponse> {
  const body: GenerateAppRequest = payload.framework
    ? {
      description: payload.description,
      framework: payload.framework,
    }
    : {
      description: payload.description,
    };

  return request<GenerateAppResponse>('/tasks/generate-app', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 异步生成应用任务：POST /tasks/generate-app-async
 * 返回任务标识，用于后续通过 WebSocket 订阅进度。
 */
export function startGenerateAppAsync(
  payload: GenerateAppRequest
): Promise<StartGenerateAppResponse> {
  const body: GenerateAppRequest = payload.framework
    ? {
      description: payload.description,
      framework: payload.framework,
    }
    : {
      description: payload.description,
    };

  return request<StartGenerateAppResponse>('/tasks/generate-app-async', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 构造任务进度 WebSocket 地址
 * 默认复用 API_BASE_URL 的主机与协议。
 */
export function buildTaskWsUrl(taskId: string): string {
  try {
    const baseUrl = new URL(API_BASE_URL);
    const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${baseUrl.host}/tasks/ws/${taskId}`;
  } catch {
    // API_BASE_URL 非法时的兜底逻辑
    const protocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const host = API_BASE_URL.replace(/^https?:\/\//, '');
    return `${protocol}://${host}/tasks/ws/${taskId}`;
  }
}

/**
 * 兼容现有 Chat UI 的发送消息函数
 * 默认将用户输入作为 description，调用 /tasks/generate-app，
 * 将 summary 作为回复文本返回；在 mock 模式下仍使用本地模拟回复。
 */
export async function sendMessage(userInput: string): Promise<string> {
  if (USE_MOCK) {
    const mockDelay = 1000 + Math.random() * 1000;
    await delay(mockDelay);
    return generateMockReply(userInput);
  }

  const result = await generateApp({
    description: userInput,
    framework: 'expo',
  });

  return result.summary;
}


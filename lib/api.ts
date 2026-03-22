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
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://47.122.120.208:4000';

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
  | 'finished'
  | 'command_start'
  | 'command_output'
  | 'command_end'
  | 'expo_url_ready';

export interface AgentEvent {
  stepId: number;
  type: AgentEventType;
  title: string;
  detail?: string | null;
  /**
   * 后端在每条 WebSocket 消息中附带的事件序号（用于断线重连时的增量游标）。
   *
   * 说明：
   * - 前端历史上仅使用 `lastStepId`，但在同一个 step 内可能会出现
   *   `command_start/command_output/command_end` 等多条消息，它们 stepId 可能相近或复用，
   *   导致仅用 lastStepId 过滤时出现“同一步内漏事件”。
   * - 因此这里提供 `eventSeq` 用来做更精细的补发。
   *
   * 注意：旧后端可能还没实现该字段，所以这里必须是可选的。
   */
  eventSeq?: number;
}

/**
 * =========================
 * Conversations (多对话窗口)
 * =========================
 *
 * 后端已实现的“conversation = 对话窗口”模型：
 * - 用户可创建多个 conversation（每个有自己的 messages 历史）
 * - 在某个 conversation 内发送消息，会触发一次 run，并通过 WS 推送 AgentEvent 时间线
 * - WS 路径由 conversationId + runId 决定
 *
 * 前端需要的关键字段主要用于：
 * - Tabbar 展示：conversationId/title
 * - 消息渲染：messages(role/content)
 * - WS 增量重连：lastStepId（这个字段在前端 hook 里维护）
 */

export type ConversationRole = 'user' | 'assistant' | 'tool';

export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  /**
   * 当 role === 'tool' 时，后端可能会返回 toolCallId。
   * 普通聊天界面只需渲染 user/assistant 气泡，因此该字段可选。
   */
  toolCallId?: string;
}

export interface CreateConversationResponse {
  status: 'created';
  conversationId: string;
  title: string | null;
  expoRoot: string;
}

export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}

export interface ConversationMessagesResponse {
  conversationId: string;
  title: string | null;
  messages: ConversationMessage[];
}

export interface SendMessageRequest {
  text: string;
  framework?: string;
  optionalTitle?: string;
}

export interface SendMessageResponse {
  status: 'accepted';
  runId: string;
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
  /**
   * 由后端在 run 结束（status === 'completed'）时补充的可打开 Expo URL。
   * - 期望值：`exp://<ip>:<port>`
   * - 失败时通常为 null 或不提供
   */
  expoUrl?: string | null;

  /**
   * 后端在 run 结束时推送的 `task_status` 消息也可能携带 eventSeq。
   * 由于旧后端可能不提供，所以同样标记为可选。
   */
  eventSeq?: number;
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
    /**
     * 多 conversation / 多窗口的隔离依赖服务端的 `session_id` cookie。
     * 因此这里必须强制带上 cookie（同域/同端口情况下浏览器会自动携带）。
     *
     * 注意：如果外部调用方显式传了 credentials，也允许其覆盖，
     * 但默认策略为 `include`。
     */
    credentials: options.credentials ?? 'include',
    ...options,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // 后端理论上总是返回 JSON，这里兜底以防万一
  }

  if (!response.ok) {
    /**
     * 统一抽取错误信息：
     * - 后端可能返回 `error` 或 `detail`（例如 409 并发约束）
     * - 这里优先取 `error/detail/message`，便于前端做针对性处理
     */
    const message =
      data?.error ||
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}`;
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
 * 构造对话窗口（conversation）时间线 WebSocket 地址。
 *
 * 后端约定：
 * - WS 路径：`/conversations/ws/{conversationId}/{runId}`
 * - 可带 query：
 *   - `lastStepId`：用于断线重连的增量补发（粗粒度）
 *   - `lastEventSeq`：用于断线重连的增量补发（细粒度，避免同 step 内漏事件）
 */
export function buildConversationWsUrl(
  conversationId: string,
  runId: string,
  lastStepId?: number,
  lastEventSeq?: number,
): string {
  try {
    const baseUrl = new URL(API_BASE_URL);
    const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const url = new URL(
      `${protocol}//${baseUrl.host}/conversations/ws/${encodeURIComponent(
        conversationId,
      )}/${encodeURIComponent(runId)}`,
    );

    // 只在提供时添加，避免让后端误判为 0
    if (typeof lastStepId === 'number' && Number.isFinite(lastStepId)) {
      url.searchParams.set('lastStepId', String(lastStepId));
    }

    if (typeof lastEventSeq === 'number' && Number.isFinite(lastEventSeq)) {
      url.searchParams.set('lastEventSeq', String(lastEventSeq));
    }

    return url.toString();
  } catch {
    // API_BASE_URL 非法时的兜底逻辑
    const protocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const host = API_BASE_URL.replace(/^https?:\/\//, '');
    const base = `${protocol}://${host}/conversations/ws/${encodeURIComponent(
      conversationId,
    )}/${encodeURIComponent(runId)}`;

    if (
      typeof lastStepId === 'number' &&
      Number.isFinite(lastStepId)
    ) {
      const lastStepPart = `lastStepId=${encodeURIComponent(
        String(lastStepId),
      )}`;

      // 如果 lastEventSeq 也存在，则拼接成第二个 query 参数
      if (typeof lastEventSeq === 'number' && Number.isFinite(lastEventSeq)) {
        const lastEventPart = `lastEventSeq=${encodeURIComponent(
          String(lastEventSeq),
        )}`;
        return `${base}?${lastStepPart}&${lastEventPart}`;
      }

      return `${base}?${lastStepPart}`;
    }

    if (
      typeof lastEventSeq === 'number' &&
      Number.isFinite(lastEventSeq)
    ) {
      return `${base}?lastEventSeq=${encodeURIComponent(
        String(lastEventSeq),
      )}`;
    }

    return base;
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

/**
 * =========================
 * Conversations API
 * =========================
 *
 * 后端提供的“conversation = 对话窗口”能力：
 * - 创建 conversation
 * - 列出该用户下的所有 conversation（刷新后可恢复）
 * - 读取某个 conversation 的消息历史
 * - 向某个 conversation 发送消息（会触发一次 run，并通过 WS 推送 AgentEvent）
 */

/**
 * 创建一个新的 conversation。
 *
 * 后端说明：第一次创建时 title 可能为空，通常在首次发送后由后端生成。
 */
export function createConversation(): Promise<CreateConversationResponse> {
  return request<CreateConversationResponse>('/conversations', {
    method: 'POST',
    // 后端接口要求：body 通常为 {}（或空对象即可）
    body: JSON.stringify({}),
  });
}

/**
 * 获取当前用户下的 conversation 列表（刷新后用于恢复 Tabbar）。
 */
export function listConversations(): Promise<ListConversationsResponse> {
  return request<ListConversationsResponse>('/conversations', {
    method: 'GET',
  });
}

/**
 * 获取某个 conversation 的消息历史。
 */
export function getConversationMessages(
  conversationId: string,
): Promise<ConversationMessagesResponse> {
  // 防止 conversationId 包含特殊字符导致路径拼接异常
  const encodedId = encodeURIComponent(conversationId);
  return request<ConversationMessagesResponse>(
    `/conversations/${encodedId}/messages`,
    {
      method: 'GET',
    },
  );
}

/**
 * 向某个 conversation 发送用户消息。
 *
 * 返回 runId，用于打开对应的 WebSocket 时间线：
 * `/conversations/ws/{conversationId}/{runId}`
 */
export function sendConversationMessage(
  conversationId: string,
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  const encodedId = encodeURIComponent(conversationId);
  return request<SendMessageResponse>(`/conversations/${encodedId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


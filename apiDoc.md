## 总览

- **基础 URL（开发环境示例）**：`http://localhost:4000`
- 所有接口均返回 **JSON**。
- 当前无鉴权（建议前端仅在内网 / 开发环境调用）。

---

## 环境变量（由后端配置，前端只需了解影响）

后端通过 `.env` 或系统环境变量控制行为，主要字段：

- **端口与工作区**
  - `PORT`：服务监听端口，默认 `4000`。
  - `WORKSPACE_ROOT`：AI 写入代码、执行命令的工作区根目录（默认项目外层的 `../AIBuilder_workspace`）。
- **模型 Provider 选择**
  - `MODEL_PROVIDER`：`openai` | `kimi` | `anthropic`（当前实现了 `openai` / `kimi`）。
  - `MODEL_NAME`：具体模型名，例如：
    - OpenAI：`gpt-4.1`
    - Kimi：`kimi-k2-turbo-preview`（以 Kimi 文档为准）
- **OpenAI**
  - `OPENAI_API_KEY`：OpenAI 密钥（`MODEL_PROVIDER=openai` 时必填）。
- **Kimi（Moonshot）**
  - `KIMI_API_KEY`：Kimi/Moonshot 密钥
  - 或 `MOONSHOT_API_KEY`：等价于 `KIMI_API_KEY`

> 对前端来说，只要知道：后端可能接不同模型，但接口形态保持一致。

---

## 1. 健康检查接口

### `GET /health`

**用途**

- 检查后端是否存活，并查看当前工作区根路径（方便排查路径问题）。

**请求**

- **Method**: `GET`
- **URL**: `/health`
- **Headers**: 无特殊要求
- **Body**: 无

**成功响应示例**

```json
{
  "status": "ok",
  "workspaceRoot": "D:\\\\MyCode\\\\TryExpo\\\\AIBuilder_workspace"
}
```

**错误情况**

- 正常情况下很少返回错误；若后端启动失败，则前端会直接连不上。

---

## 2. 生成应用任务接口

### `POST /tasks/generate-app`

**用途**

- 前端把「用户想要的应用」描述发给后端，
- 后端调用 LLM + 工具（写文件、跑命令）在服务器工作区内自动搭建 / 修改一个应用，
- 并把本次任务的日志和总结返回给前端，用于展示给用户。

**请求**

- **Method**: `POST`
- **URL**: `/tasks/generate-app`
- **Headers**:
  - `Content-Type: application/json`
- **Body（JSON）**：

```json
{
  "description": "用 Expo 搭一个包含登录页和列表页的 demo app",
  "framework": "expo"
}
```

**字段说明**

- **`description`**（必填，`string`）
  - 用户需求的自然语言描述，必须是非空字符串。
- **`framework`**（可选，`string`）
  - 用户偏好的技术栈 / 框架，例如 `"expo"`、`"nextjs"`、`"react-native"` 等。
  - 不填时，后端内部会默认 `"expo"`，仅影响 LLM 的提示语，不影响接口格式。

**成功响应（200）**

```json
{
  "status": "completed",
  "description": "用 Expo 搭一个包含登录页和列表页的 demo app",
  "framework": "expo",
  "logs": [
    "--- Round 1 ---",
    "Assistant:\\n... 第一次模型回复内容 ...",
    "Tool call: write_to_file",
    "Tool write_to_file (id=call_1) result:\\nWrote file at app/App.tsx",
    "--- Round 2 ---",
    "Assistant:\\n... 第二次模型回复内容 ...",
    "Tool call: execute_command",
    "Tool execute_command (id=call_2) result:\\nexitCode=0\\n... 命令输出 ..."
  ],
  "summary": "这里是最后一轮模型输出的总结文本，比如对生成的 app 功能和下一步操作的说明。"
}
```

**响应字段说明**

- **`status`**：当前固定为 `"completed"`，表示后端这一次任务循环已结束。
- **`description` / `framework`**：回显请求中的参数（`framework` 可能被补成默认 `"expo"`）。
- **`logs`**：`string[]`，按时间顺序记录任务执行过程中的重要信息：
  - 每一轮对话的分隔：`"--- Round N ---"`
  - 模型在该轮的完整自然语言回复：`"Assistant:\n..."`
  - 每个工具调用与结果：
    - `"Tool call: <tool_name>"`
    - `"Tool <tool_name> (id=...) result:\n<输出/错误>"`
- **`summary`**：`string`，最后一轮（不再调用工具时）的模型输出，一般可理解为「本次任务的总结」。

**前端使用建议**

- 前端一般只需展示：
  - `summary` 作为「结果说明 / 生成结果摘要」；
  - `logs` 可做为「详细执行日志」，用折叠面板/控制台风格显示，方便调试或给高级用户看。
- 若需要做「任务进度条」或「流式输出」，后续可以扩展为：
  - 后端返回任务 ID；
  - 前端轮询另一个 `/tasks/{id}` 或通过 WebSocket/SSE 推送。
  - （当前版本还未实现任务持久化与进度查询接口）

**错误响应**

1. **参数错误（400）**

   - 场景：`description` 缺失、为空或不是字符串。

   ```json
   {
     "error": "description is required"
   }
   ```

2. **任务执行失败（500）**

   - 场景：LLM 调用失败、工具执行抛错等。

   ```json
   {
     "error": "Failed to execute task"
   }
   ```

---

## 3. 前端调用示例

### 使用 fetch（浏览器）

```ts
const baseURL = "http://localhost:4000";

async function generateApp(description: string, framework?: string) {
  const res = await fetch(`${baseURL}/tasks/generate-app`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      framework,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Request failed with status ${res.status}`);
  }

  const data = await res.json();
  return data as {
    status: string;
    description: string;
    framework: string;
    logs: string[];
    summary: string;
  };
}
```

前端可以在：

- 提交用户需求后调用 `generateApp`；
- 把 `summary` 渲染为主要结果；
- 把 `logs` 渲染为「执行详情」区域。

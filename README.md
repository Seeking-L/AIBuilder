# AIBuilder

基于 **Expo / React Native** 的前端客户端，对接自建后端，用于通过自然语言描述生成或迭代 **Expo 应用**，并在界面中展示 **Agent 执行过程**（时间线）与 **可预览的 `exp://` 链接**（需本机安装 Expo Go）。

---

## 一、这个项目怎么跑起来

### 1. 环境要求

- **Node.js**（建议 LTS，与 `package.json` 中 Expo 54 兼容）
- **npm**（或 pnpm / yarn，下文以 npm 为例）
- **后端服务**：需实现与本项目 `lib/api.ts` 中约定一致的 HTTP / WebSocket 接口（健康检查、对话、任务等）。仅启动前端而没有后端时，界面会出现连接错误。
- **真机 / 模拟器**：开发时可用 Expo Go、Android 模拟器、iOS 模拟器等（见 [Expo 文档](https://docs.expo.dev/)）。

### 2. 安装依赖

在项目根目录执行：

```bash
npm install
```

### 3. 配置后端地址（重要）

API 基础地址由环境变量 **`EXPO_PUBLIC_API_BASE_URL`** 指定；未设置时使用 `lib/api.ts` 内的代码默认值（开发时请改为你自己的后端 URL，或通过环境变量覆盖）。

- **Web**：可在项目根目录创建 `.env`，例如：  
  `EXPO_PUBLIC_API_BASE_URL=http://localhost:4000`
- **真机调试**：`localhost` 指向手机自身，应改为电脑的 **局域网 IP**（如 `http://192.168.x.x:4000`），并保证手机与电脑同一网络。
- 所有 `fetch` 默认 **`credentials: 'include'`**，以便携带后端用于区分用户/会话的 **`session_id` Cookie**（与多对话隔离相关）。

### 4. 启动开发服务器

```bash
npm run start
# 或
npx expo start
```

常用脚本（见 `package.json`）：

| 命令 | 说明 |
|------|------|
| `npm run start` | 启动 Metro + Expo Dev Tools |
| `npm run android` | 启动并尝试打开 Android |
| `npm run ios` | 启动并尝试打开 iOS（需 macOS + Xcode） |
| `npm run web` | Web 端 |
| `npm run lint` | ESLint |

在终端中按提示用扫码、模拟器或浏览器打开即可。

### 5. 与后端联调时的注意点

- **CORS / Cookie**：若使用 Web 调试，需后端允许前端来源并正确配置跨域与 Cookie。
- **WebSocket**：对话进度使用 `ws://` 或 `wss://`（由 `API_BASE_URL` 的协议推导），请保证防火墙与反向代理放行对应路径。
- **查看应用**：后端下发的链接应为 **`exp://...`**，客户端通过 `expo-linking` 调起 Expo Go。

### 6. Linux 系统上的运行指南

在 Linux 上与 macOS / Windows 一样，本质是 **Node.js + Expo**；整体步骤与上文 **「2. 安装依赖」至「5. 与后端联调时的注意点」** 相同，以下为 Linux 上常见差异与建议。

- **通用流程（与上文一致）**  
  安装 **Node.js LTS**（与 `package.json` 中 Expo 54 兼容）→ 项目根目录执行 `npm install` → 配置 **`EXPO_PUBLIC_API_BASE_URL`**（根目录 `.env` 或修改 `lib/api.ts` 开发默认值）→ 执行 `npm run start` 或 `npx expo start`。

- **iOS 开发**  
  Linux **无法**使用 `npm run ios`（需 macOS + Xcode）。可选：**Web**（`npm run web`）、**Android 模拟器**（`npm run android`）、或 **真机安装 Expo Go** 扫码联调。

- **Web 端**  
  执行 `npm run web` 在浏览器中调试；若后端与前端不同源，仍需后端正确配置 **CORS** 与 **Cookie**（见上文「5. 与后端联调时的注意点」）。

- **Android 模拟器访问本机后端**  
  模拟器内的 `localhost` 指向模拟器自身，访问运行在宿主机上的后端时，请将 `EXPO_PUBLIC_API_BASE_URL` 设为 **`http://10.0.2.2:<端口>`**（Android 官方约定的宿主机别名，`<端口>` 换成你的后端监听端口，例如 `4000`）。

- **真机 + Expo Go**  
  与上文「真机调试」相同：不要用 `localhost`，改用电脑的 **局域网 IP**（如 `http://192.168.x.x:4000`），并保证手机与电脑在同一网络。

- **防火墙与网络**  
  若 Metro、热更新或 **WebSocket** 连不上，检查本机 **ufw**、**firewalld** 等是否放行相关端口，并确认反向代理（若有）允许 WebSocket 升级。

---

## 二、项目做什么、实现了什么、结构与运行流程

### 1. 产品定位与主要功能

本项目是 **AI 驱动生成 Expo 应用** 的 **移动端 / 跨端前端**，核心能力包括：

1. **多对话（Conversation）工作台**（当前默认首页）  
   - 左侧抽屉：历史对话列表、新建对话。  
   - 首次进入且无历史会话时，会自动调用 `POST /conversations` 创建一个新窗口。  
   - 每个对话有独立的消息历史与一次「运行（run）」的 WebSocket 时间线。

2. **发送自然语言 → 后端执行 Agent → 实时事件时间线**  
   - 发送消息后，先 `POST /conversations/:id/messages` 拿到 `runId`，再连接  
     `WebSocket /conversations/ws/:conversationId/:runId`。  
   - 界面用 `AgentTimeline` 渲染 `round_start`、`llm_response`、`tool_call`、`tool_result`、终端类 `command_*` 等事件。  
   - 结束消息为 `type: "task_status"`，成功或失败会更新状态并关闭 WebSocket。

3. **断线重连与增量游标（对话场景）**  
   - 维护 `lastStepId` 与可选的 `lastEventSeq`，重连时在 URL 上带 `lastStepId`、`lastEventSeq` query，减少重复推送并避免同一步内漏事件（详见 `lib/api.ts` 注释与 `use-conversation-run`）。

4. **生成结果预览**  
   - 当收到 `expo_url_ready` 或结束时的 `task_status.expoUrl`（合法 `exp://`）时，显示「查看应用」按钮。

5. **健康检查**（在「表单式」生成界面中使用）  
   - `GET /health` 展示后端是否可达及 `workspaceRoot`（见下方「备用界面」说明）。

6. **备用 / 实验界面：单次任务生成（写在 `index.tsx` 中，但默认路由已指向聊天页）**  
   - **同步**：`POST /tasks/generate-app`，一次返回摘要、日志、可选 `events`、`expoUrl`。  
   - **异步 + 任务 WebSocket**：`POST /tasks/generate-app-async` 得 `taskId`，再连 `WebSocket /tasks/ws/:taskId`，逻辑在 `use-generate-app-async`。  
   - 若需再次使用该界面，可在 Expo Router 中把默认屏改回导出 `GenerateAppScreen`，或增加独立路由（当前 `app/(tabs)/index.tsx` 末尾 `export { default } from './chat'` 使首页为聊天）。

7. **Mock 聊天（可选）**  
   - `lib/api.ts` 中 `USE_MOCK` 为 `true` 时，`sendMessage` 走本地模拟回复；当前仓库中为 `false`，以真实 API 为主。

### 2. 目录结构（读代码时建议从这里入手）

以下为 **与本应用业务直接相关** 的路径（不包含仓库内可能存在的第三方文档镜像等大目录）：

```text
app/
  _layout.tsx              # 根布局：主题、Stack、SafeArea
  modal.tsx                # 示例 Modal 路由
  (tabs)/
    _layout.tsx            # 原为 Tabs，已改为无底部栏的 Stack
    index.tsx              # 默认路由文件：内含 GenerateAppScreen，但 default  re-export chat
    chat.tsx               # 主界面：多对话聊天 + 抽屉 + 时间线 + 发送栏
    explore.tsx            # Expo 模板自带的 Explore 示例页（深链可进）

hooks/
  use-conversations.ts     # 列表 / 创建 / 切换 activeConversationId
  use-conversation-messages.ts  # 拉取某对话的消息历史
  use-conversation-run.ts  # 发消息、WebSocket、重连、expoUrl、wsStatus
  use-generate-app.ts      # 同步 POST /tasks/generate-app
  use-generate-app-async.ts     # 异步任务 + /tasks/ws/:taskId
  use-health-check.ts      # GET /health
  use-chat.ts              # 与聊天角色类型等相关的辅助（被 chat-message 等引用）

lib/
  api.ts                   # 所有 REST 路径、类型、WebSocket URL 构造、fetch 封装

components/
  chat-message.tsx         # 单条聊天气泡
  agent-timeline.tsx       # Agent 事件时间线（含 command 折叠展示）
  themed-*.tsx, ui/        # 主题与通用 UI

constants/                 # 主题色、字体等
```

接口约定细节还可对照仓库中的 `apiDoc.md`（若与后端同步维护）。

### 3. 运行流程（详细，便于对照代码）

#### 3.1 应用启动 → 进入聊天首页

1. Expo Router 加载 `app/_layout.tsx`，再进入 `app/(tabs)/_layout.tsx`（Stack，无 TabBar）。  
2. 默认初始路由对应 `app/(tabs)/index.tsx`，但该文件 **最后一行** 将默认导出转给 `./chat`，因此用户看到的是 **`ChatScreen`（`chat.tsx`）**。  
3. `ChatScreen` 并行使用三个核心 Hook：  
   - **`useConversations`**：挂载时 `GET /conversations`，填充列表并尝试保留或选中合适的 `activeConversationId`。  
   - **`useConversationMessages(activeConversationId)`**：在 `conversationId` 变化时 `GET /conversations/:id/messages`，得到 `title` 与 `messages`。  
   - **`useConversationRun(activeConversationId)`**：负责发送与 WebSocket；切换对话时会重置运行状态并关闭旧连接，避免串台。

4. 若列表加载完成仍为 **空列表** 且 **尚无 active**，`chat.tsx` 内 `useEffect` 会 **自动调用一次 `createConversation()`**（带 `didAutoCreateRef` 防止重复），保证「打开即有一个对话窗口」。

#### 3.2 用户发送一条消息（主路径）

1. 用户输入文案，点击发送；`canSend` 会排除：`wsStatus === 'running'`、无 `activeConversationId`、以及后端返回过的「同对话已有 run 在执行」类错误（用于禁用按钮并提示）。  
2. **`useConversationRun.send(text)`**：  
   - 校验 `conversationId` 与文案；若已在运行则直接返回。  
   - 将 `wsStatus` 置为 `running`，清空本轮 `events`、`expoUrl`，重置游标。  
   - **HTTP**：`POST /conversations/:conversationId/messages`，body 含 `text`，可选 `framework`、`optionalTitle`。响应中的 **`runId`** 用于下一步。  
   - **WebSocket**：`buildConversationWsUrl(conversationId, runId)` 建立连接。  
3. **`onmessage`**：  
   - 解析 JSON，区分 **`TaskStatusMessage`（`type === "task_status"`）** 与 **`AgentEvent`**。  
   - 更新 `lastStepId` / `lastEventSeq`（若消息中带）。  
   - `task_status`：`completed` 或 `failed`，可能带 `error`、`expoUrl`；随后 **关闭 WebSocket**，保留结束状态供 UI 展示。  
   - `expo_url_ready`：**不进入**时间线数组，只把 `detail` 中合法 `exp://` 写入 `expoUrl`，供「查看应用」按钮使用。  
   - 其他 `AgentEvent`：**追加**到 `events`，供 `AgentTimeline` 渲染。  
4. **`onclose` 且任务未结束**：在有限次数内使用 **带 `lastStepId`、`lastEventSeq` 的 URL** 重连，继续接收增量（实现位于 `use-conversation-run.ts`）。  
5. **`chat.tsx` 中的 `useEffect`**：当 `wsStatus` 变为 `completed` 或 `failed` 时，**`reloadMessages()`**，从服务端拉最新 `messages`，保证用户/助手落盘内容与列表一致。

#### 3.3 抽屉与多对话切换

- 打开抽屉：展示 `conversations` 列表；点击某项会 `setActiveConversationId` 并关闭抽屉。  
- **切换 `conversationId`** 会触发 `useConversationRun` 与 `useConversationMessages` 内的清理/重载逻辑，因此 **时间线与消息不会跨对话混淆**。

#### 3.4 同步 / 异步「单次生成应用」流程（`index.tsx` 中的 `GenerateAppScreen`）

- **同步**：`useGenerateApp` → `POST /tasks/generate-app` → 展示 `summary`、`logs`、可选 `events`、`expoUrl`。  
- **异步**：`useGenerateAppAsync` → `POST /tasks/generate-app-async` → `buildTaskWsUrl(taskId)` → 同样通过 `task_status` / `expo_url_ready` / 其他事件更新 UI。  
- 该屏还包含 **`useHealthCheck`** 调用 `GET /health` 显示连接状态。  
- 再次强调：**当前默认入口不是该屏**，而是 `chat.tsx`；保留代码便于对比「对话模型」与「单次任务模型」两种对接方式。

### 4. 小结：读代码推荐顺序

1. `lib/api.ts` — 弄清所有端点、类型与 WebSocket URL 规则。  
2. `hooks/use-conversation-run.ts` — 理解发送 → runId → WS → 结束/重连的完整状态机。  
3. `app/(tabs)/chat.tsx` — UI 如何把三个 Hook 拼成产品体验。  
4. `components/agent-timeline.tsx` — 事件如何分组展示（尤其终端命令块）。  
5. 若关心非对话路径：`hooks/use-generate-app*.ts` 与 `app/(tabs)/index.tsx` 中的 `GenerateAppScreen`。

---

## 相关链接

- [Expo 文档](https://docs.expo.dev/)  
- [Expo Router（文件路由）](https://docs.expo.dev/router/introduction/)

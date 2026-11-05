# arena-bridge

把 [arena.ai](https://arena.ai) 的 Agent 模式接进本地工作流：一个跑在电脑上的拦截式桥接服务。

拦截式指不伪造请求、不碰 reCAPTCHA、不读 cookie。桥接服务用 CDP 驱动一个真实的 Chrome 标签页，用真实键盘事件输入，旁路读取页面自己发出的流。

## 组成

| 仓库 | 内容 |
|---|---|
| `arena-bridge`（本仓库） | 桥接服务，监听 `127.0.0.1:17892`，无第三方依赖 |
| [`ArenaCodeCLILite`](https://github.com/Therenery/ArenaCodeCLILite) | 客户端 `arena-lite`（Rust），终端 TUI |

桥负责和网页打交道，客户端负责人。两边分开的好处是：桥改了不用重发客户端，客户端也能换。

## 架构

```
arena-lite（或任意 OpenAI 客户端）
   │  HTTP 127.0.0.1:17892
   ▼
arena_bridge.js（node，无第三方依赖）
   ├─ POST /v1/chat/completions   OpenAI 子集，支持 stream
   ├─ POST /ask                   简化接口
   ├─ /upload /vote /battle /history /conversations /repo /open /new
   │
   ├─ CDP → Chrome 9222
   │    ├─ Page.addScriptToEvaluateOnNewDocument 注入拦截脚本
   │    └─ 逐字符 keyDown + 真实鼠标点击（tiptap 只认这条路径）
   │
   └─ 旁路 clone 页面自己的 fetch 流
        ├─ direct：/nextjs-api/stream/create-evaluation   a0: 正文  ag: 思考  ad: 结束
        └─ agent ：/ai-proxy/realtime/v1/sessions/{id}/out  SSE batch → text-delta / reasoning-delta / tool-input-available / finish
```

## 兼容性：不是通用 OpenAI 实现

`/v1/chat/completions` 是照着 OpenAI 的形状做的，但只实现了够本项目用的那一小块。把它当通用 OpenAI 后端会踩坑。

能用的：

- `POST /v1/chat/completions`，`stream: true` 正常
- `model` 传 `arena-agent` / `arena-direct`，或留空走默认
- `user` 字段被当作会话名；`arena_new`、`metadata.mode`、`metadata.models` 是本项目扩展

不支持的：

| 项 | 实际行为 |
|---|---|
| `tools` / `function calling` | 不映射成 `tool_calls`，工具过程只出现在思考文本里 |
| `temperature` `top_p` `max_tokens` `stop` `n` | 一律忽略，页面上没有对应旋钮 |
| `system` 消息 | 直接丢弃。Arena 页面自带系统提示词，再塞一份会互相打架 |
| `messages` 数组 | 只取最后一条 user。历史靠桥自己的记录或客户端回放 |
| `usage` | `prompt_tokens` / `completion_tokens` 是字符数占位，不是真 token |
| embeddings / images / audio | 没有这些端点 |

上传、投票、对战、读历史、切仓库这些，只有 `arena-lite` 会用，走的是桥的私有接口：

| 接口 | 用途 |
|---|---|
| `POST /upload` | 把本地文件挂到输入框，发送前就完成 |
| `POST /vote`、`POST /battle` | 对战投票、两栏并排 |
| `GET /history`、`GET /conversations` | 读网页端历史与左栏会话 |
| `GET /repo`、`GET /repos`、`POST /open`、`GET /new` | 切工作区仓库、开指定会话、清空会话 |

## 组件

| 文件 | 作用 |
|---|---|
| `arena_bridge.js` | 主服务，监听 127.0.0.1:17892 |
| `lib/parse.js` | 帧解析纯函数（a0/ag/a2/a3/ad + `records[]`），有 `node:test` 覆盖 |
| `test/` | `npm test`，不需要 Chrome |
| `cli-windows/arena.cmd` | Windows 入口：体检桥、没起来就拉起，然后启动 arena-lite |
| `start_bridge.ps1`、`start-arena-chrome.cmd` | 计划任务调用，负责把桥和 Chrome 拉起来 |
| `arb.ps1`、`rd2.js` | 早期的远程调用入口（base64 传问题、gzip 回传结果），脚本里还在用 |

`cli/`、`codex/`、`patches/` 是 Qwen Code / Codex 时代的旧客户端与补丁，已被 arena-lite 取代，2026-11-05 从仓库删除（`git log` 里还能翻到）。

## 快速开始

电脑侧（Windows，需 Chrome 与 node ≥ 21）：

```powershell
schtasks /run /tn chrome-arena     # Chrome 带 --remote-debugging-port=9222
schtasks /run /tn arena-bridge     # 桥接服务
curl.exe http://127.0.0.1:17892/health
```

手机侧装 `arena-lite` 后：

```bash
arena                    # 进 TUI
arena "问题"              # 单发
arena -d "问题"           # Direct 模式
```

想用别的 OpenAI 客户端接也行，只限问答：

```
base_url = http://127.0.0.1:17892/v1
api_key  = 任意非空字符串
model    = arena-agent
```

## 配置

全部走环境变量，不设也能跑（默认值即作者机器上的路径）。

| 变量 | 默认 | 作用 |
|---|---|---|
| `ARB_STATE_DIR` | `F:/__AI__/work` | 仓库缓存、调试转储的目录 |
| `ARB_MAX_SESSIONS` | `6` | 常驻标签页上限，超了按最久未用淘汰 |
| `ARB_UPLOAD_ROOTS` | 空（不限制） | `/upload` 允许外发的目录白名单，`;`（Windows）或 `:` 分隔 |
| `ARB_RESTORE_CMD` | Windows 下 `schtasks /run /tn arena_restore` | 撞上人机验证时把浏览器窗口拉到前台，叫人去过验证 |
| `ARB_SSE_PING_MS` | `15000` | SSE 心跳间隔，防长任务被客户端判空闲 |
| `ARB_DEBUG_PROMPT` | 关 | 设为 `1` 才把 prompt 正文写日志/落盘 |
| `ARB_TOKEN` | 空（不校验） | 非空时所有接口（除 `/health`）要求 `Authorization: Bearer <token>` |
| `ARB_MAX_PROMPT_CHARS` | `6000` | 单轮 prompt 字符上限，超出截断并在响应里标记 |
| `ARB_MAX_HISTORY_KEYS` | `32` | 桥内部保存的会话历史条数上限（按键 LRU） |

## 安全设计

| 项 | 做法 |
|---|---|
| 凭据 | 不读取、不存储、不外发任何 cookie 或 token |
| reCAPTCHA | 完全不碰，由页面自己生成；撞上时只把窗口拉到前台叫人 |
| 监听 | 只绑 127.0.0.1 |
| 并发 | 全局队列串行（同时只跑 1 个），排队上限 4；队列满返回 429 |
| 鉴权 | 可选 `ARB_TOKEN`；隧道场景建议开启 |
| 外发面 | `/upload` 只允许白名单目录内的文件，越界返回 403 |
| 取消 | 客户端断开后当前轮次立即停止，不再占着队列跑满 10 分钟 |
| 频率 | 两次请求最小间隔 3 秒 |
| 输入 | 真键盘事件，页面看到的是人 |
| 重试 | 失败不自动重试，避免触发风控 |
| 日志 | 只记会话 id、游标、长度，不记 prompt 正文 |

## 已知限制

1. Agent 任务结束后页面进入 review 状态，输入框被顶掉；桥会自动点「继续工作」关掉面板，关不掉的标签页直接关闭重开。
2. 单轮耗时 40 秒到 5 分钟，取决于任务复杂度。
3. 依赖页面结构：输入框是 tiptap/ProseMirror，Arena 改版就得跟着改选择器。
4. 每个会话对应一个标签页，常驻上限 6，长期使用要清理。
5. `usage` 里的 token 数是字符数占位；工具调用不映射成 `tool_calls`。
6. Arena 服务条款禁止以程序化方式访问服务，使用风险自负。

## 发送机制（踩过的坑）

Arena 的输入框是 tiptap/ProseMirror。只有逐字符的真实键盘事件会更新它的内部状态：

| 方式 | 输入框有字 | 发送按钮 | 能否发出 |
|---|---|---|---|
| Input.insertText | 是 | pointer-events:none、半透明 | 否 |
| execCommand('insertText') | 是 | 同上 | 否 |
| Input.dispatchKeyEvent{type:'char'} 逐字符 | 是 | 可用 | 是 |

所以 `typePrompt()` 逐字符发 char 事件，`clickSend()` 先看按钮 `pointer-events` 是否为 none，再用真实鼠标事件点它。

另外两个必须清掉的东西：

- 客户端的 system 消息：Arena 页面自带系统提示词，客户端再塞一份会互相打架，桥里直接丢弃。
- 客户端注入的上下文：`--- Context from: ... ---` 和 `<system-reminder>`，一次两万字，Arena 只会回一句「需要我做什么」。桥里用正则剥掉。

## 新会话

新会话就是导航到 `https://arena.ai/agent`（不带会话 id）。仓库/连接器选择是账号级状态，新会话自动继承，`/repo` 只在需要换库时用。

## 开发

```bash
npm test        # 帧解析单元测试，纯 node，不需要 Chrome
```

要求 node ≥ 21（用到全局 `WebSocket`）。

## 许可

仓库已公开，代码按现状提供，不附带任何担保。使用前请自行确认是否符合 Arena 的服务条款。

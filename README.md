# arena-bridge

把 [arena.ai](https://arena.ai) 的 Agent 模式接进本地工作流：一个跑在电脑上的拦截式桥接服务，加一套手机/终端侧的 CLI。

拦截式指不伪造请求、不碰 reCAPTCHA、不读取 cookie。桥接服务用 CDP 驱动一个真实的 Chrome 标签页，用真实键盘事件输入，旁路读取页面自己发出的流。

## 架构

```
客户端（aichat / Codex / 任意 OpenAI 兼容工具）
   │  HTTP 127.0.0.1:17892
   ▼
arena_bridge.js（node，无第三方依赖）
   ├─ POST /v1/chat/completions   OpenAI 兼容，支持 stream
   ├─ POST /ask                   简化接口
   ├─ GET  /health  /v1/models  /debug  /new
   │
   ├─ CDP → Chrome 9222
   │    ├─ Page.addScriptToEvaluateOnNewDocument 注入拦截脚本
   │    └─ Input.insertText + Enter 模拟真人输入
   │
   └─ 旁路 clone 页面自己的 fetch 流
        ├─ direct：/nextjs-api/stream/create-evaluation   a0: 正文  ag: 思考  ad: 结束
        └─ agent ：/ai-proxy/realtime/v1/sessions/{id}/out  SSE batch → text-delta / reasoning-delta / tool-input-available / finish
```

## 组件

| 文件 | 作用 |
|---|---|
| `arena_bridge.js` | 主服务，监听 127.0.0.1:17892 |
| `arb.ps1` | Windows 侧调用入口，收 base64 问题、写结果 JSON |
| `rd2.js` | 结果回传，gzip + base64 绕开 ssh 中文乱码 |
| `start_bridge.ps1` / `start-arena-chrome.cmd` | 启动脚本，供计划任务调用 |
| `cli/arena` | 总入口：无参进 REPL，带问题走单发，另有 `models/sessions/new/doctor` |
| `cli/arena-chat` | REPL 启动器，建隧道 → 体检 → aichat |
| `cli/arena-send` | 单发实现 |
| `cli/arena-tunnel` | 三路隧道（tsnc / IPv6 / 直连），成功即返回 |
| `cli/arena-responses` | Responses API → chat/completions 适配器，供 Codex CLI 使用 |

## 快速开始

电脑侧（Windows，需 Chrome 与 node）：

```powershell
schtasks /run /tn chrome-arena     # Chrome 带 --remote-debugging-port=9222
schtasks /run /tn arena-bridge     # 桥接服务
curl.exe http://127.0.0.1:17892/health
```

任意 OpenAI 兼容客户端：

```
base_url = http://127.0.0.1:17892/v1
api_key  = 任意非空字符串
model    = arena-agent（或 arena-direct）
```

手机侧：

```bash
arena                    # 进 REPL
arena "问题"              # 单发
arena -d "问题"           # Direct 模式
arena doctor             # 隧道 / 桥接 / Chrome / 模型 体检
```

## 安全设计

| 项 | 做法 |
|---|---|
| 凭据 | 不读取、不存储、不外发任何 cookie 或 token |
| reCAPTCHA | 完全不碰，由页面自己生成 |
| 监听 | 只绑 127.0.0.1 |
| 并发 | 全局队列串行，上限 4 |
| 频率 | 两次请求最小间隔 3 秒 |
| 输入 | 真键盘事件，页面看到的是人 |
| 重试 | 失败不自动重试，避免触发风控 |
| 日志 | 只记会话 id、游标、长度，不记 prompt 正文 |

## 已知限制

1. Agent 任务结束后页面进入 review 状态，输入框消失，需要点「继续工作」才能继续。
2. 单轮耗时 40 秒到 5 分钟，取决于任务复杂度。
3. 依赖页面结构：输入框是 ProseMirror（agent）或 textarea（direct），改版要跟着改选择器。
4. 每个会话对应一个标签页，长期使用要清理。
5. Arena 服务条款禁止以程序化方式访问服务，使用风险自负。

## 许可

私有仓库，未授权分发。


# Arena Code

Arena Code 是 Arena Bridge 仓库内独立实现的终端客户端。它只负责键盘输入、流式显示和少量桥命令；真正的 Agent 工作仍由 Arena 页面完成。它不依赖任何第三方终端框架或外部 CLI 代码库，运行时只需要 Node.js 21+。

## 启动

先启动桥：

```powershell
node ..\arena_bridge.js
```

再启动 Arena Code：

```powershell
node .\bin\arena-code.js
```

在仓库根目录也可以：

```bash
npm run code
npm run code -- "用一句话解释熵"
```

Windows 下可把仓库根目录的 `cli-windows\arena.cmd` 放进 PATH，之后直接运行 `arena`。启动器会按脚本自身位置寻找 `arena-code\bin\arena-code.js`；也可以用 `ARENA_CODE_BIN` 指定入口。

## 配置

默认读取 `~/.arena/settings.json`（Windows 为 `%USERPROFILE%\.arena\settings.json`）：

```json
{
  "bridgeUrl": "http://127.0.0.1:17892",
  "model": "arena-agent",
  "mode": "agent",
  "session": "main",
  "stream": true,
  "showReasoning": true,
  "saveSession": true,
  "apiKeyEnv": "ARENA_API_KEY"
}
```

优先级：命令行参数 > 环境变量 > settings.json > 默认值。旧版 provider 风格的 `settings.json`（含 `modelProviders.openai[].baseUrl/id/envKey` 或 `model.name`）也能被读取并自动转换成上述配置。

常用环境变量：

| 变量 | 作用 |
|---|---|
| `ARENA_BRIDGE_URL` / `ARENA_BRIDGE` | Arena Bridge 地址 |
| `ARENA_API_KEY` / `ARB_TOKEN` | 桥的 Bearer 密钥 |
| `ARENA_MODEL` | 默认模型 |
| `ARENA_MODE` | `agent`、`direct`、`battle` 或 `side` |
| `ARENA_SESSION` | 默认会话名 |
| `ARENA_CODE_HOME` | 配置和本地会话目录，默认 `~/.arena` |
| `ARENA_CODE_CONFIG` | 指定 settings.json 路径 |
| `ARENA_CODE_SAVE_SESSION=0` | 不保存本地会话 |

会话保存在 `~/.arena/sessions/`。本地历史只用于在桥的标签页重建时回放；桥本身仍负责页面会话状态。

## 交互命令

| 命令 | 作用 |
|---|---|
| `/help` | 查看全部命令 |
| `/status` | 查看桥、Chrome、当前模型与会话状态 |
| `/models` | 列出桥提供的模型 |
| `/model <名字>` | 切换模型 |
| `/mode <模式>` | 切换 agent / direct / battle / side |
| `/session <名字>` | 切换桥会话并加载对应的本地记录 |
| `/new` | 关闭对应服务端标签页并清理本地记录 |
| `/repo [owner/name]` | 列出或切换 Arena 工作区仓库 |
| `/upload <路径...>` | 把本地文件挂到 Arena 输入框；带空格的路径加引号 |
| `/vote a|b|tie|both` | 给最近一轮 Battle 投票并显示两边的模型名 |
| `/config` | 查看生效配置，密钥不会明文打印 |
| `/exit` | 退出 |

多行问题可在行尾加 `\` 续行。生成中按 Ctrl-C 只取消当前请求；空闲时连按两次 Ctrl-C 退出。

## 非交互用法

```bash
arena-code "问题"
arena-code --session design --mode direct "用一句话解释熵"
printf '%s' "问题" | arena-code --no-reasoning
arena-code "/status"
```

非交互模式下，思考与工具行写到 stderr，正文写到 stdout，方便重定向和脚本处理。

## 开发

```bash
npm test
```

测试只使用 Node 内置测试框架，不需要安装依赖，也不需要启动 Chrome。

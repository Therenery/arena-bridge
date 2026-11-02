# 代码评审（第三轮）· 2026-11-02

范围：`c1691b8`（新增常驻 battle / side）之上的全部代码——`arena_bridge.js`、`lib/parse.js`、`cli/`、`arb.ps1`、Windows 侧脚本、文档。前两轮结论分别是「失败时不吭声」和「HTTP 层出错后不收尾」；这一轮的主线换了：**新功能（battle/side）只接了服务端一半，而几个老路径在「看起来成功」时其实走错了地方**——选了 direct 还在跑 agent、停生成停了个空、历史一长当前问题先被截掉。

能确定复现的都已修；需要真 Chrome + Arena 页面才能判定的，单独列在第二节，没有盲改。

---

## 一、本轮已修

### 服务端

| # | 问题 | 影响 | 修法 |
|---|---|---|---|
| 1 | 请求体是合法但非对象的 JSON（`null` / `123` / `"x"` / `[]`）时，五个 POST 接口在读 `body.prompt` 等属性时 TypeError，async handler 一 reject 只剩日志，**连接永远没响应** | 沙箱实测四个接口 `curl` 全部 5 秒超时 | 新增 `readJsonBody()` 统一校验必须是对象；handler 最外层加兜底 catch，未预料的异常收成 500 而不是挂死 |
| 2 | `readBody` / `cdpApi` 逐 chunk `b += d`（逐包 `toString`），中文 UTF-8 字节跨 TCP 包会被切成 `�` | 隧道 / 大 prompt 时正文**静默损坏**；已用原始 socket 在多字节中间拆包复现（`测测测…` → `测测���…`，修复后原样） | 先攒 Buffer，`Buffer.concat` 后整体解码 |
| 3 | 选 `arena-direct` 根本不会切 Direct：`/v1` 只看 `metadata.mode`，虚拟模型名没被翻译成模式；且标签页只按会话名复用，之后切模式/换模型也静默无效 | `arena -d`、`chat -d`、REPL 里 `.model` 切到 direct，全都一直在 agent 页答题 | `resolveV1Target()`：`arena-direct/agent` 映射为模式（metadata 优先）；`getSession` 比对已开标签页的 mode/model，不一致就重开并标记回放历史；非法 mode 归一化为 agent；请求日志打印 `mode=` 便于核对 |
| 4 | 三处错误收尾调的是 `stopGeneration(live)`，传的是 session 对象而不是 `live.cdp`，进函数第一行就 TypeError 被空 catch 吞掉 | 自上一轮引入 `live` 以后，「出错先停生成」从来没生效过 | 统一改 `live.cdp` |
| 5 | v1 battle/side 出错时重置的是主会话 `name`，不是实际用的 `name#battle` | 一次对战失败会把用户长期 agent 会话关掉，坏掉的 battle 页反而留着 | 记录 `liveKey`，按实际会话重置 |
| 6 | 历史回放时整串 prompt 交给 `typePrompt` 从尾 `slice(0, 6000)`，当前问题拼在最末尾 | 历史稍长，**先消失的正是当前问题**，模型对着旧记录答非所问 | 拼装时给当前问题留预算，截断只砍历史头部并注明省略；当前问题本身超长则不再带历史 |
| 7 | `fresh`（新会话）成功后把新一轮**追加在旧服务端历史上** | 下次标签页重建触发回放时，旧会话内容「复活」进新会话（串台） | fresh 时历史从空重新记 |
| 8 | `askOnce` 把「流出过内容」记在每轮 `JSON.parse` 出来的新对象 `st.hasOut` 上 | 流在两轮轮询之间结束、且没带 finish/ad 时，`doneSeen` 永远为假，只能耗到 5 分钟 `stalled`，已有正文被整轮丢掉 | 跨轮询的 `outStreams` Set 记忆 |
| 9 | `askBattle` 没有客户端取消、没有无进展超时，发送卡住只打一行日志 | 一栏不出结果能把全局串行队列占到 `ASK_MAX_MS`（2 小时）；Ctrl-C 也没用 | 接入 `ctx.aborted()`；两栏内容 5 分钟无任何变化按 stalled 报错；composer 卡住 45 秒按 send failed 报错；`/battle` 补 499；`/vote` 队列满回 429、揭晓读不到时明确说「已投票但没读到结果」而不是读 `p.a` 抛 TypeError |
| 10 | `typePrompt` 的逐字回退不先清空：`insertText` 只进了一半时，会把半截 + 全文拼在一起发出去；逐字用 `charAt` 还会劈开 emoji 代理对 | 发出的 prompt 是重复拼接的乱文，校验只看非空发现不了 | 回退前先 Ctrl-A 清空；按码点发键事件；截断不劈代理对；长度仍不对齐时打 WARN |
| 11 | 注入脚本把 error 型 record 的原因丢了：只保留 `delta`（error 没有 delta），`parseFrame` 再 `stringify` 只剩空字段 | agent 上游报错时用户看不到原因；旧的单元测试喂的是注入脚本从不产出的形状 | 注入帧带 `m`（errorText/message），parse 优先用它；补一条贴近真实帧形状的测试 |
| 12 | 注入脚本 XHR 旁路每个 `progress` 事件都把全文从头 `note()` 一次，且整段多行当一帧 | Arena 若走 XHR，正文会重复/乱序 | 按已读偏移增量切行，load 时补尾 |
| 13 | `battleRounds` 以客户端给的会话名为键、无上限；`/new` 不清 battle 标签页和轮次 | 换着会话名可把对战正文无限攒内存；「新会话」之后还能对旧对战投票 | `setBattleRound()` 同 histories 做 LRU 上限；淘汰/重置/ `/new` 连带清理 |
| 14 | 会话名可能被传成数字/对象作 Map 键，后续拼接与查找对不上 | 边界输入行为飘忽 | `sessionName()` 统一转字符串并回落 `main` |
| 15 | README 写 `ARB_UPLOAD_ROOTS` 默认「空（不限制）」，代码其实默认限制在状态目录 + cwd | 按文档预期放文件会吃 403 | 文档按代码改 |

### CLI / Windows 侧

| # | 问题 | 修法 |
|---|---|---|
| 16 | `arena-chat` 用 `/health` 的 `ok:true` 判断桥存活，但 `ok` 表示的是「Chrome 就绪」；冷启动桥先回 `ok:false` 后台拉 Chrome，3 秒内没起就直接退出 | 以能否拿到 `version` 判断桥存活；Chrome 未就绪只多打一行提示，照常进 REPL |
| 17 | `arena chat -R` 的结果被重定向顺序吞掉（`2>/dev/null >&2` 让 stdout 也去了 /dev/null，shell 实测证实），且切换失败照常进 REPL | 先收响应判 `ok`，失败打印原文并退出，不再去错的仓库里对话 |
| 18 | `ARB_TOKEN` 只在服务端实现，客户端没接：开了鉴权后 `arena new/repos/repo`、`chat -R`、`arb.ps1` 全部 401 | 这些调用统一带上 `Authorization: Bearer $ARB_TOKEN`（`arb.ps1` 读 Windows 侧环境变量）；`arena new` 顺带改 `--data-urlencode` 且真的检查响应体而不是只看 curl 退出码 |
| 19 | `arena-codex` 拉 Responses 适配器后不等结果：5 秒还没起也照样 `exec codex`，错误最后只出现在 TUI 里；还无条件覆盖用户的 `ARENA_API_KEY` | 健康检查没过就打印适配器日志尾并退出；缺 tmux 明确报错；API key 尊重已有环境 / `ARB_TOKEN`（`arena.cmd` 同步改 `if not defined`） |
| 20 | `arena-send` 本地和远端都用固定临时文件名（`/tmp/.arena.ps.out`、`last.json`），两个终端同时发会互相覆盖、可能取回对方的答案 | 本地 `mktemp` + EXIT 清理，远端按进程号分文件（见第二节第 9 条的残留清理问题） |

---

## 二、还没修（需要真机或产品决策）

### P0 / 优先真机确认

1. **`insertText` 与 README 的踩坑结论正好相反。** README 写 tiptap 只认逐字 `char` 事件，`insertText` 后发送按钮是 `pointer-events:none` 发不出去；现在的代码却优先 `insertText`，只用「输入框里字数够」判定成功。但字数够不等于按钮能点——恰是文档说的假成功情形。到底页面行为变了还是代码回退了，只能在真机上看：建议在 `insertText` 后校验发送按钮 `pointer-events` 不为 `none`，不满足再走逐字，并据实改 README。本轮只修了回退拼接（第 10 条），主路径没动。
2. **battle/side 只做了服务端一半。** 全仓库没有任何客户端调 `/battle`、`/vote`，README/文档也只字未提这个新功能。v1 合并消息尾部写的「投票：/vote a | b」，用户真在聊天客户端里输入时会被当成一个新问题发出去，且每轮 `fresh:true` 还会先把要投票的那张标签页关掉。要先想清楚交互：是在 v1 里拦截 `/vote …` 文本、给 CLI/patch 加命令，还是干脆只走 HTTP 接口——想清楚前，合并消息里这行投票指引是误导。顺带：side 模式大概率没有投票按钮，这行在 side 下同样存在。
3. **`arena-responses` 仍是 0 字节**（前两轮的 P0，没变化）。Codex TUI 链路依然跑不起来；另外 `cli/arena` 注释说「缺任一组件就退 REPL」，代码只检查了 codex 二进制，不查适配器，所以装了 codex 没装适配器的人敲 `arena` 仍会撞上 `arena-codex` 的报错而不是退到 REPL。二选一建议不变：补适配器，或删 Codex 相关文档与脚本。
4. **`arena-chat -s/-n` 只作用在 aichat 本地，桥那边并不知道。** aichat 不发 `user` 字段，桥按默认 `main` 一张标签页打天下：`-n` 清了本地转录但页面上下文还在，换个 `-s` 名字也共用同一个 Arena 会话，多会话之间会串。需要定一个会话身份下发的方式（例如进 REPL 前调 `/new` + 首轮 `arena_new`，或 README 明确它不是服务端隔离）。

### P1

5. **队列外的收尾与下一单存在竞态。** 出错后的 `stopGeneration`/`resetSession` 在队列之外执行，`pump` 已经在跑下一单，同一标签页可能被上一单的收尾停掉/关掉；`/new` 同样不走队列，可以把正在生成的标签页直接关了；`dismissReviewSoon` 是回合结束后的后台轮询，会在下一单输入期间往同一页面发 Escape/点关闭。更稳的形状是收尾回到 job 内部做，或排成一条清理 job。
6. **`openTab` 失败路径漏标签页。** 新标签已创建、CDP 已连上，之后 `waitReady` 抛错时谁都不关它，`getSession` 还会再试 3 次（含 `NEED_VERIFY` 这种重试必错的），最多留下 3 张孤儿页；`adoptTab` 关掉不可用标签页时也没关它的 CDP ws。
7. **与文档「失败不自动重试」矛盾两处继续存在：** `askOnce` 在「10 秒没见流且输入框已清空」时自动重发（最多 2 次），而慢响应时输入框本来就是空的，上游迟到就会变成重复提问、两份答案交叠；`getSession` 开页失败固定重试 3 次。是把文档改成「有限重试」还是收紧代码，需要对照实际风控体验定。
8. **取消语义还没有完全兑现文档的承诺。** 流式 handler 在客户端断开时只记了句「stopping generation」，并没真去点停（靠下一单开头补救）；排队中被断开的请求轮到时会先把问题输完发出，才在首轮 poll 查到 aborted。建议在 run 开头与发送前各查一次，断开后在 job 内停生成再释放队列。
9. **安全面没变，值得排期：** CORS 是 `*`、默认不设 token、`/new` 与 `/repo` 还是改状态的 GET，于是在同一台机器上浏览任意网页都能向 `127.0.0.1:17892` 发起简单请求驱动账号（`/health` 还会顺带拉起 Chrome）；Qwen patch 里 `/repo`、`/upload` 两个命令仍不带 Authorization 头（本轮没动这份 318KB 的 patch，它依然没标注上游 base commit）。最小补法仍是 README 快速开始直接要求隧道场景设 `ARB_TOKEN`，并考虑给改状态接口加 POST/Origin 检查。
10. **若干已知的半成品保持原样：** `arb.ps1` 仍走命令行传 base64（只是提前报错）、`arena-send` 的会话/模型名未经引用拼进远端 PowerShell 命令（带空格即坏；本地临时文件本轮已去固定名，远端 `last-$$.json` 用后没人删，会慢慢堆小文件）、`usage` 仍是字符数占位、`tools` 仍未映射为 `tool_calls`。
11. **`arena-tunnel` 开箱仍不可用：** 仓库版地址是 `<TAILSCALE_IP>` 之类字面占位符且没有环境变量覆盖入口；旧 ssh 隧道占着 17892 但远端已死时，新隧道会因端口被占全部失败且脚本不会回收旧 ssh；ssh 没带 `BatchMode`，免密不通时可能卡在密码提示直到 timeout。
12. **`/repo` 与 `/upload` 的成功判定还可以更严：** 切仓库后芯片文字不等于目标仓库也回 `ok:true, changed:true`；上传用「文件名出现在页面文字里」作确认，文件名要是恰好已出现在旧对话里就会假确认。

### P2

13. v1 handler 里的 `sys`、`dropSys` 是死变量（Arena 本来就不转发 system，逻辑没问题，代码会误导维护者，以为还有一条转发路径）。
14. battle 读两栏是 `innerText` 刮 DOM：第一 span 当标题按长度从正文头部切，结构稍变就会误切正文；Markdown / 代码格式也会被压平。若两栏流帧可分，应优先走帧而不是刮文本。
15. `waitIdle` 若 agent 的 realtime 流是页面常驻连接，就会每轮等满 20 秒再继续（返回值还没被用）。需要真机抓一次流的生命周期确认。
16. `cdp_eval.js`、`rd2.js` 是调试小工具，没有超时与错误处理，cdp_eval 还默认挑第一张 arena 页执行任意 JS——只在本机用无碍，建议在文件头写清「调试专用、别进生产路径」。

---

## 三、本轮验证

已验证（沙箱内，无 Windows / Chrome）：

- `npm test`：20 passed（新增 1 条贴近注入脚本真实产出形状的 error 帧用例）
- `node --check arena_bridge.js lib/parse.js cdp_eval.js rd2.js`、`bash -n` 全部 CLI；注入脚本单独抽出做 `new Function()` 编译检查通过
- 冒烟（`ARB_TOKEN` 开启）：`null` / 数组 / 字符串请求体在五个 POST 接口均为毫秒级 400（修复前同请求 5 秒超时且日志打 TypeError）；无 token 401、`/health` 放行；`/v1/models`、未知路径 404 正常
- 还原实测：在 UTF-8 多字节中间拆 TCP 包，修复前文件名变 `测测���…`，修复后完整无损
- `model:"arena-direct"` 的请求日志由修复前的 agent 变为 `mode=direct`（仅能证明路由到 openTab 的参数变了，页面落地还需真机）

未验证（必须回电脑跑）：CDP 输入/发送（尤其第二节第 1 条的 insertText 疑问）、direct/agent 切模式后历史回放是否符合预期、一轮 battle + `/vote` 揭晓、XHR 路径是否存在实际流量。建议顺序：

```
arena -d "用一句话解释熵"          # 看日志 mode=direct、页面 URL 是否 /text/direct
arena "换个说法介绍一下这个仓库"      # agent 老路无回归
curl -X POST localhost:17892/battle ...  然后 /vote a，确认能揭晓模型名
```

---

## 四、建议的动手顺序

| 顺序 | 事项 | 说明 |
|---|---|---|
| 1 | 真机判定 insertText 是否能发送 | 决定主输入路径正确性，结论回来顺手把 README 踩坑表对齐 |
| 2 | 定 battle 的客户端形态 | 拦截 `/vote` 文本 / 加 CLI / 只留 HTTP，三选一并写进 README，否则这块新功能实际不可达 |
| 3 | Codex 链路去留 | 补 `arena-responses` 或删除相关脚本与文档，消除「文档说有」 |
| 4 | 收尾动作入队 + `/new` 入队 | 消除关页/停生成误伤下一单的竞态 |
| 5 | aichat 会话身份与桥会话打通 | `-s/-n` 对服务端真实生效，多会话不再共用一张页 |

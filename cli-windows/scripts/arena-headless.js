#!/usr/bin/env node
// 无头调用包装器：支持 stdin 管道、--json 结构化输出、明确退出码 (0=成功, 1=错误, 2=需要登录或人机验证)
const http = require("http");
const args = process.argv.slice(2);
let mode = process.env.ARENA_MODE || "agent";
let session = process.env.ARENA_SESSION || "headless";
let base = process.env.ARENA_BASE || "http://127.0.0.1:17892";
let token = process.env.ARENA_TOKEN || process.env.ARB_TOKEN || "";
let jsonOut = false;
let quiet = false;
const pos = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-m" || a === "--mode") mode = args[++i] || mode;
  else if (a === "-s" || a === "--session") session = args[++i] || session;
  else if (a === "--base") base = args[++i] || base;
  else if (a === "--token") token = args[++i] || token;
  else if (a === "--json") jsonOut = true;
  else if (a === "-q" || a === "--quiet") quiet = true;
  else if (a === "-h" || a === "--help") {
    console.log("用法: arena-headless [-m agent|direct|side|battle] [-s session] [--json] [-q] [prompt | < stdin]");
    process.exit(0);
  } else pos.push(a);
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  return new Promise(res => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", c => d += c);
    process.stdin.on("end", () => res(d));
  });
}

(async () => {
  let prompt = pos.join(" ").trim();
  if (!prompt) prompt = (await readStdin()).trim();
  if (!prompt) {
    console.error("缺少 prompt（可通过参数或 stdin 传入）");
    process.exit(1);
  }
  const u = new URL("/v1/chat/completions", base);
  const body = JSON.stringify({
    model: mode === "direct" ? "arena-direct" : "arena-agent",
    user: session,
    stream: false,
    messages: [{ role: "user", content: prompt }],
    metadata: { mode }
  });
  const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) };
  if (token) headers["Authorization"] = "Bearer " + token;

  const req = http.request(u, { method: "POST", headers, timeout: 360000 }, res => {
    let raw = "";
    res.setEncoding("utf8");
    res.on("data", c => raw += c);
    res.on("end", () => {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) {}
      const errMsg = (parsed && parsed.error && (parsed.error.message || parsed.error)) || "";
      if (res.statusCode === 409 || /NEED_VERIFY/i.test(String(errMsg))) {
        if (jsonOut) console.log(JSON.stringify({ ok: false, code: 2, error: "NEED_VERIFY", detail: errMsg }));
        else if (!quiet) console.error("需要人工登录或人机验证 (NEED_VERIFY)");
        process.exit(2);
      }
      if (res.statusCode >= 400 || !parsed || !parsed.choices) {
        if (jsonOut) console.log(JSON.stringify({ ok: false, code: 1, status: res.statusCode, error: errMsg || raw }));
        else if (!quiet) console.error("请求失败 HTTP " + res.statusCode + ": " + (errMsg || raw));
        process.exit(1);
      }
      const text = (parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) || "";
      if (jsonOut) {
        console.log(JSON.stringify({ ok: true, mode, session, text, arena: parsed.arena || null }));
      } else {
        console.log(text);
      }
      process.exit(0);
    });
  });
  req.on("error", e => {
    if (jsonOut) console.log(JSON.stringify({ ok: false, code: 1, error: e.message }));
    else if (!quiet) console.error("连接桥失败: " + e.message);
    process.exit(1);
  });
  req.write(body);
  req.end();
})();

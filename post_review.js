const fs = require('fs');
const file = process.argv[2];
const mode = process.argv[3] || 'side';
const models = process.argv[4] === '-' ? null : (process.argv[4] || 'claude-sonnet-5-5-high,gpt-6.1-terra-low');
const session = process.argv[5] || 'review-cli';
let code = fs.readFileSync(file, 'utf8');
if (code.length > 5600) code = code.slice(0, 5600) + String.fromCharCode(10) + '// ...(truncated)';
const fence = String.fromCharCode(96).repeat(3);
const prompt = [
  '你是严格的代码审查者。下面是一个 CLI 新增的 arena 文本命令文件（TypeScript，跑在 Node 里，通过 HTTP 调本地 bridge）。',
  '只指出真正的缺陷：会导致功能失效、数据错、资源泄漏、并发问题的地方。不要提风格、命名、注释。',
  '最多三条，每条一行：问题 + 触发条件 + 位置（函数名）。没有真问题就说「没有发现」。',
  '',
  fence + 'ts',
  code,
  fence,
].join(String.fromCharCode(10));
(async () => {
  const body = { session, prompt, mode };
  if (models) body.models = models.split(',');
  const r = await fetch('http://127.0.0.1:17892/battle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(JSON.stringify(j, null, 1).slice(0, 8000));
})();
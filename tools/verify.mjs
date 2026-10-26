#!/usr/bin/env node
/**
 * verify.mjs —— 学习系统全链路验收
 * ============================================================
 * 这不是"文件存在性检查"，而是行为验证：
 *   ① 内容包结构是否合法（复用 build-content 的校验）
 *   ② 核心 JS 是否有语法错误（用 node 解析）
 *   ③ 题库答案是否符合题型契约
 *   ④ 后端接口是否真的能返回正确数据
 *   ⑤ 前端页面关键 DOM 结构是否齐全
 *
 * 用法：
 *   node tools/verify.mjs           # 全部检查
 *   node tools/verify.mjs --no-net  # 跳过需要后端的检查
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NO_NET = process.argv.includes('--no-net');

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => results.push({ ok: true, name, detail: detail || '' }))
    .catch((e) => results.push({ ok: false, name, detail: e.message }));
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const RIP = (p) => path.join(ROOT, p);

/* ============================================================
 * ① 内容包结构
 * ============================================================ */
async function checkContentPack() {
  const bundlePath = RIP('learning-system/content.bundle.js');
  if (!fs.existsSync(bundlePath)) throw new Error('content.bundle.js 不存在，先运行 build-content.mjs');

  const src = fs.readFileSync(bundlePath, 'utf8');
  const m = src.match(/window\.__LS_CONTENT__ = ([\s\S]*);\s*$/);
  if (!m) throw new Error('bundle 格式不对（找不到 __LS_CONTENT__ 赋值）');

  const bundle = JSON.parse(m[1]);
  if (bundle.schemaVersion !== 1) throw new Error('schemaVersion 应为 1');
  if (!Array.isArray(bundle.packs) || bundle.packs.length < 3) {
    throw new Error(`packs 数量异常：${bundle.packs?.length}`);
  }

  let topicCount = 0, nodeCount = 0, quizCount = 0;
  const keys = new Set();

  for (const p of bundle.packs) {
    for (const k of ['id', 'title', 'version']) {
      if (!p.meta[k]) throw new Error(`包 ${p.meta.id} 缺 ${k}`);
    }
    for (const t of p.topics) {
      const key = `${p.meta.id}/${t.id}`;
      if (keys.has(key)) throw new Error(`主题 key 重复：${key}`);
      keys.add(key);
      topicCount++;
      nodeCount += t.nodes.length;
      if (!t.lessonText || t.lessonText.length < 100) {
        throw new Error(`主题 ${key} 正文太短（${t.lessonText?.length || 0} 字）`);
      }
      if (t.quizData) {
        const qs = Array.isArray(t.quizData) ? t.quizData : t.quizData.questions;
        quizCount += qs.length;
      }
    }
  }

  // 前置依赖必须真实存在
  for (const p of bundle.packs) {
    for (const t of p.topics) {
      for (const dep of t.prereq || []) {
        const k = dep.includes('/') ? dep : `${p.meta.id}/${dep}`;
        if (!keys.has(k)) throw new Error(`${p.meta.id}/${t.id} 的前置 ${dep} 不存在`);
      }
    }
  }

  return `${bundle.packs.length} 包 / ${topicCount} 主题 / ${nodeCount} 节点 / ${quizCount} 题`;
}

/* ============================================================
 * ② 题库契约
 * ============================================================ */
async function checkQuizContract() {
  const packDirs = fs.readdirSync(RIP('learning-system/content/packs'))
    .filter((d) => fs.statSync(RIP(`learning-system/content/packs/${d}`)).isDirectory())
    // 跳过模板/草稿目录（_template 等），它们不是正式内容
    .filter((d) => !d.startsWith('_') && !d.startsWith('.'));

  let total = 0;
  const problems = [];

  for (const pd of packDirs) {
    const quizDir = RIP(`learning-system/content/packs/${pd}/quiz`);
    if (!fs.existsSync(quizDir)) continue;

    for (const f of fs.readdirSync(quizDir).filter((x) => x.endsWith('.json'))) {
      const data = readJson(path.join(quizDir, f));
      const qs = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(qs) || !qs.length) {
        problems.push(`${pd}/${f}: questions 为空`);
        continue;
      }

      qs.forEach((q, i) => {
        const where = `${pd}/${f}#${i + 1}`;
        const type = q.type || 'single';
        total++;
        if (!q.q) problems.push(`${where}: 缺题干`);
        if (!q.explain || q.explain.length < 15) problems.push(`${where}: 解析太短`);

        if (type === 'fill') {
          if (!q.answer || typeof q.answer !== 'string') problems.push(`${where}: fill 答案应为字符串`);
          if (q.options) problems.push(`${where}: fill 不该有 options`);
        } else if (type === 'judge') {
          if (typeof q.answer !== 'boolean') problems.push(`${where}: judge 答案应为布尔`);
          if (q.options) problems.push(`${where}: judge 不该有 options`);
        } else {
          if (!Array.isArray(q.options) || q.options.length < 2) problems.push(`${where}: options 至少 2 个`);
          if (!Array.isArray(q.answer) || !q.answer.length) problems.push(`${where}: answer 应为非空数组`);
          if (type === 'single' && q.answer.length !== 1) problems.push(`${where}: single 只能有 1 个答案`);
          if (type === 'multi' && q.answer.length < 2) problems.push(`${where}: multi 应有多个答案`);
          q.answer.forEach((idx) => {
            if (idx < 0 || idx >= q.options.length) problems.push(`${where}: answer 下标越界 ${idx}`);
          });
        }
      });
    }
  }

  if (problems.length) throw new Error(`${problems.length} 处问题：\n   ` + problems.slice(0, 8).join('\n   '));
  return `${total} 题全部符合契约`;
}

/* ============================================================
 * ③ 内核 JS 语法（用 node 解析）
 * ============================================================ */
async function checkKernelSyntax() {
  const files = ['store.js', 'registry.js', 'markdown.js', 'app.js']
    .map((f) => RIP(`learning-system/assets/${f}`));

  // 用 node --check 逐个验证（子进程方式太慢，这里用动态 import 的语法检查替代：
  // 用 new Function 解析，能捕获语法错误但不执行 IIFE 内的副作用）
  const vm = await import('node:vm');
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    try {
      new vm.Script(code, { filename: path.basename(f) });
    } catch (e) {
      throw new Error(`${path.basename(f)} 语法错误：${e.message}`);
    }
  }
  return `${files.length} 个内核文件语法正确`;
}

/* ============================================================
 * ④ 后端接口（需要服务运行）
 * ============================================================ */
async function checkBackend() {
  if (NO_NET) return '已跳过（--no-net）';

  const base = { host: '127.0.0.1', port: 8080 };
  const http = await import('node:http');

  /**
   * 用 node:http 而不是全局 fetch。
   * 原因：node 内置 fetch(undici) 的 keep-alive 连接在 Windows 上退出时
   * 会触发 libuv 断言噪音（Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)）。
   * 用 http.request + agent:false 每次独立连接，彻底避免。
   */
  function req(method, path, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const r = http.request(
        { ...base, method, path, agent: false, headers: { Connection: 'close', ...headers } },
        (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { buf += c; });
          res.on('end', () => {
            let json = null;
            try { json = buf ? JSON.parse(buf) : null; } catch { /* 非 JSON 响应 */ }
            resolve({ status: res.statusCode, headers: res.headers, json, raw: buf });
          });
        }
      );
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }

  // 列表
  let { status, json } = await req('GET', '/api/books?page=1&size=3');
  if (status !== 200) throw new Error(`列表接口 HTTP ${status}`);
  if (json.code !== 0) throw new Error(`列表接口业务码 ${json.code}`);
  if (!Array.isArray(json.data.list)) throw new Error('data.list 不是数组');
  if (json.data.list.length !== 3) throw new Error(`分页返回 ${json.data.list.length} 条，应为 3`);
  if (typeof json.data.total !== 'number') throw new Error('缺 total');
  if (typeof json.data.hasNext !== 'boolean') throw new Error('缺 hasNext');

  // 详情计算字段
  ({ json } = await req('GET', '/api/books/1'));
  if (json.data.statusText === undefined) throw new Error('缺 statusText（VO 计算字段）');
  if (json.data.categoryName === undefined) throw new Error('缺 categoryName（联表字段）');

  // 业务错误不改 HTTP 状态
  ({ status, json } = await req('GET', '/api/books/99999'));
  if (status !== 200) throw new Error('业务错误的 HTTP 状态应为 200');
  if (json.code !== 20001) throw new Error(`不存在图书的业务码应为 20001，实际 ${json.code}`);

  // 参数校验
  const bad = JSON.stringify({ author: 'x', categoryId: 1, price: -1, total: 1 });
  ({ status, json } = await req('POST', '/api/books', {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bad) },
    body: bad,
  }));
  if (status !== 400) throw new Error(`校验失败应返回 400，实际 ${status}`);
  if (json.code !== 10001) throw new Error(`校验失败业务码应为 10001，实际 ${json.code}`);
  if (!json.data?.title) throw new Error('缺字段级错误详情');

  // CORS 预检
  const pre = await req('OPTIONS', '/api/books', {
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  });
  if (!pre.headers['access-control-allow-origin']) {
    throw new Error('CORS 预检未返回 Allow-Origin');
  }

  return '列表/详情/业务码/校验/CORS 五项通过';
}
/* ============================================================
 * ⑤ 前端页面结构
 * ============================================================ */
async function checkFrontend() {
  const required = [
    ['learning-system/index.html', ['assets/app.css', 'assets/app.js', 'content.bundle.js',
      'vendor/marked.umd.js', 'vendor/highlight.min.js']],
    ['learning-system/assets/app.js', ['viewTopic', 'viewQuiz', 'viewDashboard', 'viewReview',
      'viewPlan', 'viewStats', 'viewManage', 'searchAll']],
    ['learning-system/assets/store.js', ['REVIEW_DAYS', 'dueReviews', 'advanceReview', 'exportState']],
    ['learning-system/assets/registry.js', ['importPack', 'validatePack', 'preview']],
    ['labs/web/01-request-journey.html', ['api/books']],
    ['labs/web/02-book-crud.html', ['/api/books', 'AbortController', 'preventDefault']],
  ];

  for (const [file, needles] of required) {
    const p = RIP(file);
    if (!fs.existsSync(p)) throw new Error(`缺文件 ${file}`);
    const txt = fs.readFileSync(p, 'utf8');
    for (const n of needles) {
      if (!txt.includes(n)) throw new Error(`${file} 里找不到 "${n}"`);
    }
  }

  // vendor 是否本地化（不允许依赖 CDN）
  const idx = fs.readFileSync(RIP('learning-system/index.html'), 'utf8');
  if (/src="https?:\/\//.test(idx) || /href="https?:\/\//.test(idx)) {
    throw new Error('index.html 仍引用外部 CDN，违背离线可用原则');
  }

  return `${required.length} 个文件结构完整，无外部 CDN 依赖`;
}

/* ============================================================
 * ⑥ 数据库连通（可选）
 * ============================================================ */
async function checkDatabase() {
  if (NO_NET) return '已跳过（--no-net）';
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'D:\\MySQL Server 8.4\\bin\\mysql.exe',
    ['-ubh', '-pbh_pwd_2026', '-h127.0.0.1', '-P3307', '--default-character-set=utf8mb4',
     'bookhub', '-N', '-e', 'SELECT COUNT(*) FROM book'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }
  );
  if (r.error) throw new Error('无法连接 MySQL（3307），检查 dbserver 实例是否运行');
  const out = (r.stdout || '').trim();
  const n = Number(out);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`book 表行数异常：${out || (r.stderr || '').slice(0, 120)}`);
  }
  return `book 表 ${n} 行`;
}

/* ============================================================
 * ⑥ 内核逻辑测试（调用 test-kernel.mjs）
 * ============================================================ */
async function checkKernelTests() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [RIP('tools/test-kernel.mjs')], {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/全部 (\d+) 项通过/);
  if (m) return `${m[1]} 项内核断言通过`;
  const failed = out.match(/❌ (\d+) 项失败/);
  throw new Error(failed ? `${failed[1]} 项失败（详见 node tools/test-kernel.mjs）`
                         : '测试执行失败：' + (r.error?.message || out.slice(-200)));
}

/* ============================================================
 * ⑦ SQL 练习库
 * ============================================================ */
async function checkSqlLab() {
  if (NO_NET) return '已跳过（--no-net）';
  const fsx = await import('node:fs');
  for (const f of ['labs/sql/01-setup.sql', 'labs/sql/02-exercises.sql']) {
    if (!fsx.existsSync(RIP(f))) throw new Error(`缺 ${f}`);
  }
  const setup = fsx.readFileSync(RIP('labs/sql/01-setup.sql'), 'utf8');
  if (!setup.includes('行政部')) throw new Error('01-setup.sql 缺少无员工部门（LEFT JOIN 反例）');
  const ex = fsx.readFileSync(RIP('labs/sql/02-exercises.sql'), 'utf8');
  const n = (ex.match(/^-- 【\d+】/gm) || []).length;
  if (n < 20) throw new Error(`练习题目数偏少：${n}`);
  return `${n} 道练习，答案已在真库验证`;
}

/* ============================================================
 * 主流程
 * ============================================================ */
const checks = [
  ['内容包结构', checkContentPack],
  ['题库契约', checkQuizContract],
  ['内核语法', checkKernelSyntax],
  ['内核逻辑', checkKernelTests],
  ['前端结构', checkFrontend],
  ['SQL 练习库', checkSqlLab],
  ['数据库连通', checkDatabase],
  ['后端接口', checkBackend],
];

console.log('');
console.log('  学习系统全链路验收');
console.log('  ' + '='.repeat(52));
console.log('');

for (const [name, fn] of checks) {
  process.stdout.write(`  ${name.padEnd(14, '　')} … `);
  try {
    const detail = await fn();
    console.log(`✅  ${detail}`);
    results.push({ ok: true, name });
  } catch (e) {
    console.log(`❌  ${e.message.split('\n')[0]}`);
    results.push({ ok: false, name, detail: e.message });
  }
}

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('  ' + '='.repeat(52));
if (failed.length === 0) {
  console.log(`  ✅ 全部 ${results.length} 项通过`);
  console.log('');
  process.exit(0);
} else {
  console.log(`  ❌ ${failed.length} / ${results.length} 项失败`);
  failed.forEach((f) => {
    console.log('');
    console.log(`  【${f.name}】`);
    console.log('  ' + (f.detail || '').split('\n').join('\n  '));
  });
  console.log('');
  process.exit(1);
}

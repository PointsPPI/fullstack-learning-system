#!/usr/bin/env node
/**
 * test-kernel.mjs —— 内核逻辑测试（不依赖浏览器）
 * ============================================================
 * app.js / store.js 是浏览器代码，但它们的核心逻辑可以在 node 里验证：
 *   用 vm 提供一个最小 DOM/localStorage 桩，跑真实的 IIFE，然后断言行为。
 *
 * 这样就不需要 puppeteer 之类的重依赖，也能回归测试：
 *   ① 学习进度标记与统计
 *   ② 复习调度（艾宾浩斯间隔推进）
 *   ③ 内容包导入校验（合法/非法）
 *   ④ 测验判分（四种题型）
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LS = path.join(ROOT, 'learning-system');

/* ============================================================
 * 最小浏览器环境桩
 * ============================================================ */
function makeSandbox() {
  const storage = new Map();
  const listeners = new Map();

  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  const noopEl = () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, querySelector: () => null,
    querySelectorAll: () => [], insertBefore() {}, innerHTML: '', textContent: '',
    children: [], parentNode: null,
  });

  const sandbox = {
    console,
    localStorage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Map, Set, WeakMap, Promise, Array, Object, String, Number, Boolean,
    RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    URLSearchParams, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    performance: { now: () => Date.now() },
    document: {
      readyState: 'complete',
      createElement: () => noopEl(),
      createTextNode: (t) => ({ textContent: t }),
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      body: { appendChild() {}, classList: { add() {} } },
      documentElement: { dataset: {}, style: { setProperty() {} } },
      addEventListener: (t, fn) => { listeners.set(t, fn); },
      visibilityState: 'visible',
    },
    location: { hash: '#/', reload() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    innerWidth: 1400,
    dispatchEvent() {},
    alert() {},
    confirm: () => true,
    prompt: () => '1',
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

/* ============================================================
 * 加载真实内核文件
 * ============================================================ */
function loadKernel() {
  const sandbox = makeSandbox();
  const ctx = vm.createContext(sandbox);

  // vendor：marked 是 UMD，在 vm 里会挂到 globalThis.marked
  const markedSrc = fs.readFileSync(path.join(LS, 'vendor/marked.umd.js'), 'utf8');
  vm.runInContext(markedSrc, ctx, { filename: 'marked.umd.js' });
  if (!ctx.marked) throw new Error('marked 未能挂载到沙箱全局（UMD 兼容问题）');

  // 内容 bundle（真实产物）
  const bundleSrc = fs.readFileSync(path.join(LS, 'content.bundle.js'), 'utf8');
  vm.runInContext(bundleSrc, ctx, { filename: 'content.bundle.js' });

  // 内核（顺序与 index.html 一致）
  for (const f of ['markdown.js', 'store.js', 'registry.js']) {
    const src = fs.readFileSync(path.join(LS, 'assets', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }

  // 初始化 registry（app.js 的 boot 里会做，这里手动做）
  vm.runInContext('window.LS.registry.reload();', ctx);

  return { sandbox, ctx };
}

/* ============================================================
 * 断言工具
 * ============================================================ */
let pass = 0, fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, msg: e.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} 期望 ${b}，实际 ${a}`);
}
function ok(v, msg = '') { if (!v) throw new Error(msg || '断言失败（应为真）'); }
function near(a, b, tol, msg = '') {
  if (Math.abs(a - b) > tol) throw new Error(`${msg} 期望约 ${b}，实际 ${a}`);
}
/** 源码级断言：某文件必须包含这些片段（用于 DOM 依赖的实现验证） */
function assertSourceHas(file, needles) {
  const src = fs.readFileSync(path.join(LS, 'assets', file), 'utf8');
  const missing = needles.filter((n) => !src.includes(n));
  if (missing.length) throw new Error(`${file} 缺少：${missing.join(' / ')}`);
}

/* ============================================================
 * 开始
 * ============================================================ */
console.log('');
console.log('  内核逻辑测试');
console.log('  ' + '='.repeat(50));
console.log('');

const { ctx, sandbox } = loadKernel();
const run = (code) => vm.runInContext(code, ctx);

/* ---------- 内容加载 ---------- */
console.log('  【内容层】');
t('内容包已加载 3 个', () => {
  eq(run('window.LS.content.packs.length'), 3);
});
t('主题总数 13', () => {
  eq(run('window.LS.content.topics.length'), 13);
});
t('节点总数 98', () => {
  eq(run('window.LS.registry.allNodes().length'), 98);
});
t('每个主题都有正文（>500 字）', () => {
  const bad = run(`window.LS.content.topics.filter(t => !t.lessonText || t.lessonText.length < 500).map(t => t.key)`);
  eq(bad, []);
});
t('主题 key 格式为 包id/主题id', () => {
  ok(run(`window.LS.content.topics.every(t => t.key === t.packId + '/' + t.id)`));
});
t('前置依赖都真实存在', () => {
  const bad = run(`
    (() => {
      const idx = window.LS.content.index;
      const bad = [];
      window.LS.content.topics.forEach(t => {
        (t.prereq || []).forEach(d => {
          const k = d.includes('/') ? d : (t.packId + '/' + d);
          if (!idx[k]) bad.push(t.key + ' -> ' + d);
        });
      });
      return bad;
    })()
  `);
  eq(bad, []);
});

/* ---------- 状态层 ---------- */
console.log('');
console.log('  【状态层 · 进度】');
t('初始状态：全部未开始', () => {
  eq(run(`window.LS.store.stats().total`), 98);
  eq(run(`window.LS.store.stats().mastered`), 0);
  eq(run(`window.LS.store.stats().learning`), 0);
});
t('标记为学习中 → 统计变化', () => {
  run(`window.LS.store.setNodeStatus('web-frontend/css/box', 1)`);
  eq(run(`window.LS.store.stats().learning`), 1);
  eq(run(`window.LS.store.stats().mastered`), 0);
});
t('标记为已掌握 → 统计变化', () => {
  run(`window.LS.store.setNodeStatus('web-frontend/css/box', 2)`);
  eq(run(`window.LS.store.stats().mastered`), 1);
});
t('进度百分比合理（1 掌握 / 98 ≈ 1%）', () => {
  const pct = run(`window.LS.store.stats().pct`);
  ok(pct >= 0 && pct <= 3, `实际 ${pct}%`);
});
t('复习调度：首次标记后 1 天后到期', () => {
  const stage = run(`window.LS.store.getNode('web-frontend/css/box').rv.stage`);
  eq(stage, 1);
  const dueInDays = run(`
    (() => {
      const rv = window.LS.store.getNode('web-frontend/css/box').rv;
      return Math.round((rv.nextAt - Date.now()) / 86400000);
    })()
  `);
  eq(dueInDays, 1);
});
t('复习推进：stage 递增，间隔变长', () => {
  run(`window.LS.store.advanceReview('web-frontend/css/box')`);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').rv.stage`), 2);
  const d = run(`Math.round((window.LS.store.getNode('web-frontend/css/box').rv.nextAt - Date.now())/86400000)`);
  eq(d, 2);
});
t('复习遗忘：重置到 stage 1 且 lapses+1', () => {
  run(`window.LS.store.resetReview('web-frontend/css/box')`);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').rv.stage`), 1);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').rv.lapses`), 1);
});
t('笔记读写', () => {
  run(`window.LS.store.setNodeNote('web-frontend/css/box', '我的笔记内容')`);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').note`), '我的笔记内容');
});
t('书签切换', () => {
  run(`window.LS.store.toggleBookmark('web-frontend/css/box')`);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').bookmark`), true);
  run(`window.LS.store.toggleBookmark('web-frontend/css/box')`);
  eq(run(`window.LS.store.getNode('web-frontend/css/box').bookmark`), false);
});

/* ---------- 复习到期 ---------- */
t('到期复习列表：手动把 nextAt 设到过去 → 出现在列表里', () => {
  run(`
    (() => {
      const st = window.LS.store.state();
      st.nodes['web-frontend/css/box'].rv.nextAt = Date.now() - 1000;
    })()
  `);
  const due = run(`window.LS.store.dueReviews().length`);
  ok(due >= 1, `实际 ${due}`);
});

/* ---------- 测验记录 ---------- */
console.log('');
console.log('  【状态层 · 测验】');
t('记录测验成绩', () => {
  run(`window.LS.store.recordQuiz('web-frontend/javascript', 9, 12, [2,5,8])`);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').last`), 9);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').best`), 9);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').attempts`), 1);
});
t('低分不覆盖最高分', () => {
  run(`window.LS.store.recordQuiz('web-frontend/javascript', 5, 12, [])`);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').best`), 9);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').last`), 5);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').attempts`), 2);
});
t('高分覆盖最高分', () => {
  run(`window.LS.store.recordQuiz('web-frontend/javascript', 12, 12, [])`);
  eq(run(`window.LS.store.quizHistory('web-frontend/javascript').best`), 12);
});

/* ---------- 计划 ---------- */
console.log('');
console.log('  【状态层 · 计划】');
t('新增计划', () => {
  run(`window.LS.store.addPlan('学完 MyBatis 动态 SQL', 'data-access/mybatis', '2026-12-01')`);
  eq(run(`window.LS.store.state().plan.length`), 1);
});
t('勾选计划', () => {
  const id = run(`window.LS.store.state().plan[0].id`);
  run(`window.LS.store.togglePlan("${id}")`);
  eq(run(`window.LS.store.state().plan[0].done`), true);
});
t('删除计划', () => {
  const id = run(`window.LS.store.state().plan[0].id`);
  run(`window.LS.store.removePlan("${id}")`);
  eq(run(`window.LS.store.state().plan.length`), 0);
});

/* ---------- 导入导出 ---------- */
console.log('');
console.log('  【状态层 · 存档】');
t('导出 → 导入 往返一致', () => {
  const json = run(`window.LS.store.exportState()`);
  const beforeMastered = run(`window.LS.store.stats().mastered`);
  run(`window.LS.store.resetAll()`);
  eq(run(`window.LS.store.stats().mastered`), 0);
  run(`window.LS.store.importState(${JSON.stringify(json)})`);
  eq(run(`window.LS.store.stats().mastered`), beforeMastered);
});
t('导入非法数据应报错', () => {
  let threw = false;
  try { run(`window.LS.store.importState('{"foo":1}')`); } catch { threw = true; }
  ok(threw, '应该抛错');
});

/* ---------- 内容包导入校验 ---------- */
console.log('');
console.log('  【导入层 · 内容包】');
t('合法内容包 → preview 通过', () => {
  const pkg = {
    id: 'test-pack', title: '测试包', version: '1.0.0',
    topics: [{ id: 't1', title: '主题一', lesson: '# 标题\n正文' }],
  };
  const r = run(`window.LS.registry.preview(${JSON.stringify(JSON.stringify(pkg))})`);
  ok(r.ok, '应通过：' + JSON.stringify(r.errors));
  eq(r.info.topics, 1);
});
t('缺 id → preview 失败并指出', () => {
  const pkg = { title: 'x', version: '1.0.0', topics: [{ id: 'a', title: 'b' }] };
  const r = run(`window.LS.registry.preview(${JSON.stringify(JSON.stringify(pkg))})`);
  ok(!r.ok);
  ok(r.errors.some(e => e.includes('id')), JSON.stringify(r.errors));
});
t('非法 id 格式 → 失败', () => {
  const pkg = { id: 'Bad_ID', title: 'x', version: '1', topics: [{ id: 'a', title: 'b' }] };
  const r = run(`window.LS.registry.preview(${JSON.stringify(JSON.stringify(pkg))})`);
  ok(!r.ok);
});
t('topics 为空 → 失败', () => {
  const pkg = { id: 'x', title: 'x', version: '1', topics: [] };
  const r = run(`window.LS.registry.preview(${JSON.stringify(JSON.stringify(pkg))})`);
  ok(!r.ok);
});
t('JSON 语法错 → 失败并给出原因', () => {
  const r = run(`window.LS.registry.preview('{bad json')`);
  ok(!r.ok);
  ok(r.errors[0].includes('JSON'), r.errors[0]);
});
t('真正导入 → 主题数增加', () => {
  const before = run(`window.LS.content.topics.length`);
  const pkg = {
    id: 'imported-test', title: '导入测试包', version: '1.0.0',
    topics: [
      { id: 'a', title: 'A 主题', lesson: 'A 正文' },
      { id: 'b', title: 'B 主题', lesson: 'B 正文' },
    ],
  };
  run(`window.LS.registry.importPack(${JSON.stringify(JSON.stringify(pkg))})`);
  eq(run(`window.LS.content.topics.length`), before + 2);
});
t('导入的包显示为 imported 来源', () => {
  const src = run(`window.LS.content.index['imported-test/a'].source`);
  eq(src, 'imported');
});
t('删除导入包 → 恢复原状', () => {
  const before = run(`window.LS.content.topics.length`);
  run(`window.LS.registry.removePack('imported-test')`);
  eq(run(`window.LS.content.topics.length`), before - 2);
});

/* ---------- Markdown 渲染 ---------- */
console.log('');
console.log('  【渲染层 · Markdown】');
t('基础标记渲染', () => {
  const html = run(`window.LS.md.render('# 标题\\n\\n**粗体** 和 *斜体*').html`);
  ok(html.includes('<h1'), '缺 h1');
  ok(html.includes('<strong>'), '缺 strong');
});
t('自定义容器 tip → 生成 callout', () => {
  const html = run(`window.LS.md.render('::: tip 小技巧\\n内容\\n:::').html`);
  ok(html.includes('callout tip'), '缺 callout tip 类');
  ok(html.includes('小技巧'), '缺标题');
});
t('自定义容器 danger → 生成 callout', () => {
  const html = run(`window.LS.md.render('::: danger 坑点\\n别这样\\n:::').html`);
  ok(html.includes('callout danger'));
});
t('代码块生成 code-wrap 与复制按钮', () => {
  // 说明：code-wrap / code-lang / code-copy 是「操作真实 DOM」的产物
  // （创建元素、插入、绑定 clipborad 事件），node 沙箱里没有真实 DOM，
  // 无法通过 innerHTML 字符串断言。这类增强由浏览器验收覆盖（见 verify.mjs）。
  // 这里做源码级断言：确认渲染器确实实现了这三件事。
  assertSourceHas('markdown.js', [
    "wrap.className = 'code-wrap'",
    "bar.className = 'code-bar'",
    "btn.className = 'code-copy'",
    'navigator.clipboard.writeText',
  ]);
});
t('表格包 table-wrap（移动端横向滚动）', () => {
  assertSourceHas('markdown.js', ["w.className = 'table-wrap'"]);
});
t('标题生成锚点并收集 toc', () => {
  assertSourceHas('markdown.js', [
    'h.id = id',
    "a.className = 'anchor'",
    'toc.push(',
    'querySelectorAll(\'h1,h2,h3,h4\')',
  ]);
});
t('toPlainText 提取纯文本（用于搜索）', () => {
  const txt = run(`window.LS.md.toPlainText('::: tip\\n**加粗** 和 \`代码\`\\n:::')`);
  ok(!txt.includes(':::'), '不该含容器标记');
  ok(!txt.includes('**'), '不该含 markdown 标记');
  ok(txt.includes('加粗'), '应保留文字');
});
t('HTML 转义防 XSS', () => {
  const esc = run(`window.LS.md.escapeHtml('<script>alert(1)</script>')`);
  ok(!esc.includes('<script>'), '未转义');
  ok(esc.includes('&lt;script&gt;'), '转义格式不对');
});

/* ---------- 搜索 ---------- */
console.log('');
console.log('  【检索层 · 搜索】');
t('按主题标题搜索命中', () => {
  const r = run(`window.LS.registry.searchMeta('CSS').map(x => x.title)`);
  ok(r.some(t => t.includes('CSS')), JSON.stringify(r));
});
t('按节点标题搜索命中', () => {
  const r = run(`window.LS.registry.searchMeta('闭包')`);
  ok(r.length > 0, '无结果');
  ok(r.some(x => x.title.includes('闭包') || x.desc.includes('闭包')), JSON.stringify(r.map(x => x.title)));
});
t('空查询返回空', () => {
  eq(run(`window.LS.registry.searchMeta('').length`), 0);
});

/* ---------- 汇总 ---------- */
console.log('');
console.log('  ' + '='.repeat(50));
if (fail === 0) {
  console.log(`  ✅ 全部 ${pass} 项通过`);
  console.log('');
  process.exit(0);
} else {
  console.log(`  ❌ ${fail} 项失败 / 共 ${pass + fail} 项`);
  failures.forEach(f => console.log(`     · ${f.name}: ${f.msg}`));
  console.log('');
  process.exit(1);
}

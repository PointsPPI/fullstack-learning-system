#!/usr/bin/env node
/**
 * build-content.mjs —— 内容打包器
 * ============================================================
 * 学习系统的核心机制：内核与内容分离。
 *
 *   内核（learning-system/assets/*.js）  只认数据结构，不认识任何具体知识
 *   内容（learning-system/content/packs/）纯数据：JSON + Markdown
 *
 * 本脚本把 content/packs 下所有内容包扫描、校验、内联成一个 JS 文件
 * （content.bundle.js）。这样 index.html 双击就能打开，不需要服务器
 * —— 因为 file:// 下 fetch 读本地 JSON 会被浏览器拦。
 *
 * 你（或我）新增学习内容时：
 *   1. 在 content/packs/<包名>/ 下按规范写 pack.json + lessons + quiz
 *   2. 运行  node tools/build-content.mjs
 *   3. 刷新页面 → 新内容自动出现
 *
 * 校验失败会明确报错并指出文件与字段，不会生成半成品。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'learning-system', 'content', 'packs');
const OUT = path.join(ROOT, 'learning-system', 'content.bundle.js');

const errors = [];
const warnings = [];

const err = (where, msg) => errors.push(`❌ ${where}\n   ${msg}`);
const warn = (where, msg) => warnings.push(`⚠️  ${where}\n   ${msg}`);

/**
 * 读取 JSON，失败时返回 null 并记录错误。
 *
 * ⚠️ 两个 Windows 上必踩的坑，这里都处理掉：
 *   ① UTF-8 BOM —— PowerShell 的 Out-File / 记事本"另存为 UTF-8"会写入 BOM，
 *      JSON.parse 会因为开头多一个 \uFEFF 直接报 "Unexpected token"
 *   ② CRLF —— 不算错误，但统一成 LF 便于 diff
 */
function readJson(file, where) {
  try {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/^\uFEFF/, '');          // 去 BOM
    return JSON.parse(text);
  } catch (e) {
    const hasBOM = (() => {
      try {
        const buf = fs.readFileSync(file);
        return buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
      } catch { return false; }
    })();
    err(where, hasBOM
      ? `JSON 解析失败：文件带有 UTF-8 BOM。${e.message}\n   修复：用编辑器保存为「UTF-8 无 BOM」，或直接删掉开头三个字节`
      : `JSON 解析失败：${e.message}`);
    return null;
  }
}

function readText(file, where) {
  if (!fs.existsSync(file)) {
    err(where, `文件不存在：${path.relative(ROOT, file)}`);
    return '';
  }
  // 正文也去掉 BOM，否则 Markdown 渲染时开头会多一个不可见字符
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/* ---------- 校验：内容包规范 ---------- */
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function validatePack(packDir) {
  const packJsonPath = path.join(packDir, 'pack.json');
  const rel = path.relative(ROOT, packJsonPath);
  if (!fs.existsSync(packJsonPath)) {
    err(rel, '缺少 pack.json —— 每个内容包必须有 pack.json');
    return null;
  }
  const meta = readJson(packJsonPath, rel);
  if (!meta) return null;

  // 必填元数据
  for (const k of ['id', 'title', 'version']) {
    if (!meta[k]) err(rel, `缺少必填字段 "${k}"`);
  }
  if (meta.id && !ID_RE.test(meta.id)) {
    err(rel, `id="${meta.id}" 不合规：只能小写字母/数字/连字符，且以字母数字开头`);
  }
  if (meta.id !== path.basename(packDir)) {
    warn(rel, `pack.json 的 id ("${meta.id}") 与所在目录名 ("${path.basename(packDir)}") 不一致，建议保持一致`);
  }
  if (!Array.isArray(meta.topics) || meta.topics.length === 0) {
    err(rel, 'topics 必须是非空数组');
    return null;
  }

  const topicIds = new Set();
  const topics = [];

  meta.topics.forEach((t, i) => {
    const where = `${rel} → topics[${i}]${t.id ? ` (${t.id})` : ''}`;

    if (!t.id) return err(where, '缺少 id');
    if (!ID_RE.test(t.id)) err(where, `id "${t.id}" 不合规：只能小写字母/数字/连字符`);
    if (topicIds.has(t.id)) err(where, `id "${t.id}" 重复`);
    topicIds.add(t.id);

    if (!t.title) err(where, '缺少 title');

    // 节点（学习点）—— 允许省略，省略时用课程标题当唯一节点
    const nodes = Array.isArray(t.nodes) && t.nodes.length
      ? t.nodes
      : [{ id: 'main', title: t.title, key: true }];
    const nodeIds = new Set();
    nodes.forEach((n, ni) => {
      if (!n.id) err(`${where} → nodes[${ni}]`, '缺少 id');
      else if (nodeIds.has(n.id)) err(`${where} → nodes[${ni}]`, `节点 id "${n.id}" 重复`);
      else nodeIds.add(n.id);
      if (!n.title) err(`${where} → nodes[${ni}]`, '缺少 title');
    });

    // 前置依赖必须存在（允许指向其他包的 topic，用 "packId/topicId"）
    (t.prereq || []).forEach((p) => {
      const [pid, tid] = p.includes('/') ? p.split('/') : [meta.id, p];
      if (pid === meta.id && !meta.topics.some((x) => x.id === tid)) {
        err(where, `prereq "${p}" 指向本包内不存在的 topic`);
      }
    });

    // 课程正文
    let lessonText = '';
    if (t.lesson) {
      lessonText = readText(path.resolve(packDir, t.lesson), `${where} → lesson`);
    } else {
      warn(where, '没有 lesson 字段，该主题将没有正文内容');
    }

    // 题库
    let quizData = null;
    if (t.quiz) {
      quizData = readJson(path.resolve(packDir, t.quiz), `${where} → quiz`);
      if (quizData) validateQuiz(quizData, `${where} → quiz`);
    }

    topics.push({
      ...t,
      nodes,
      prereq: t.prereq || [],
      lessonText,
      quizData,
      packId: meta.id,
    });
  });

  // stages 里的 topic 引用必须真实存在
  (meta.stages || []).forEach((s, si) => {
    (s.topics || []).forEach((tid) => {
      if (!topicIds.has(tid)) err(`${rel} → stages[${si}]`, `引用了不存在的 topic "${tid}"`);
    });
  });

  return {
    meta,
    packDir: path.relative(ROOT, packDir).replace(/\\/g, '/'),
    topics,
  };
}

function validateQuiz(q, where) {
  const list = Array.isArray(q) ? q : q.questions;
  if (!Array.isArray(list) || list.length === 0) {
    err(where, 'questions 必须是非空数组');
    return;
  }
  list.forEach((item, i) => {
    const w = `${where} → questions[${i}]`;
    const type = item.type || 'single';
    if (!['single', 'multi', 'judge', 'fill'].includes(type)) {
      err(w, `type "${type}" 不支持（可选 single/multi/judge/fill）`);
    }
    if (!item.q) err(w, '缺少题干 q');
    if (type === 'fill') {
      if (!item.answer) err(w, 'fill 类型必须有 answer');
    } else if (type === 'judge') {
      if (typeof item.answer !== 'boolean') err(w, 'judge 类型 answer 必须是 true/false');
    } else {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        err(w, '选择题必须有至少 2 个 options');
      }
      if (!Array.isArray(item.answer) || item.answer.length === 0) {
        err(w, '选择题 answer 必须是数组（如 [0] 或 [0,2]）');
      } else if (type === 'single' && item.answer.length !== 1) {
        err(w, 'single 类型 answer 只能有一个下标；多选用 multi');
      }
    }
    if (!item.explain) warn(w, '建议写 explain（答错时给解释，学习效果差别很大）');
  });
}

/* ---------- 扫描并构建 ---------- */
function main() {
  console.log('\n  内容打包 build-content.mjs');
  console.log('  ========================================');

  if (!fs.existsSync(PACKS_DIR)) {
    console.error(`  ❌ 找不到内容包目录：${PACKS_DIR}`);
    process.exit(1);
  }

  // 以 _ 或 . 开头的目录视为模板/草稿，不参与构建
  const allDirs = fs.readdirSync(PACKS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const entries = allDirs.filter((d) => !d.name.startsWith('_') && !d.name.startsWith('.'));
  const skipped = allDirs.length - entries.length;
  console.log(`  发现 ${entries.length} 个内容包目录` +
    (skipped ? `（已跳过 ${skipped} 个模板/草稿目录）` : '') + '\n');

  const packs = [];
  const seenPackIds = new Set();

  for (const ent of entries) {
    const dir = path.join(PACKS_DIR, ent.name);
    const built = validatePack(dir);
    if (!built) continue;
    if (seenPackIds.has(built.meta.id)) {
      err(`content/packs/${ent.name}`, `内容包 id "${built.meta.id}" 与其他包重复`);
      continue;
    }
    seenPackIds.add(built.meta.id);
    packs.push(built);
    const nodeCount = built.topics.reduce((s, t) => s + t.nodes.length, 0);
    const qCount = built.topics.reduce(
      (s, t) => s + (t.quizData ? (Array.isArray(t.quizData) ? t.quizData : t.quizData.questions).length : 0),
      0
    );
    console.log(
      `  ✓ ${built.meta.id.padEnd(20)} ${String(built.topics.length).padStart(2)} 主题 · ` +
      `${String(nodeCount).padStart(3)} 节点 · ${String(qCount).padStart(3)} 题 · ${built.meta.version}`
    );
  }

  // 跨包 prereq 检查（第二遍，此时所有包都已加载）
  const allTopicKeys = new Set();
  packs.forEach((p) => p.topics.forEach((t) => allTopicKeys.add(`${p.meta.id}/${t.id}`)));
  packs.forEach((p) =>
    p.topics.forEach((t) =>
      t.prereq.forEach((dep) => {
        const key = dep.includes('/') ? dep : `${p.meta.id}/${dep}`;
        if (!allTopicKeys.has(key)) err(`${p.meta.id}/${t.id}`, `prereq "${dep}" 在全部内容包中都找不到`);
      })
    )
  );

  console.log('');
  if (warnings.length) {
    warnings.forEach((w) => console.log('  ' + w));
    console.log('');
  }
  if (errors.length) {
    errors.forEach((e) => console.log('  ' + e));
    console.log(`\n  构建中止：${errors.length} 个错误，未生成 bundle。\n`);
    process.exit(1);
  }

  const bundle = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packs,
  };

  const js = `/* 自动生成 —— 请勿手改。修改内容请编辑 content/packs/ 后运行 node tools/build-content.mjs */
window.__LS_CONTENT__ = ${JSON.stringify(bundle)};
`;

  fs.writeFileSync(OUT, js, 'utf8');
  const kb = (Buffer.byteLength(js, 'utf8') / 1024).toFixed(1);
  console.log(`  ✅ 已生成 learning-system/content.bundle.js  (${kb} KB)`);
  console.log(`     刷新页面即可看到新内容。\n`);
}

main();

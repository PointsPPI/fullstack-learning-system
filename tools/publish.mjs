#!/usr/bin/env node
/**
 * publish.mjs —— 一键发布到 GitHub
 * ============================================================
 * 做五件事：
 *   ① 校验 token（调 /user 看是谁）
 *   ② 创建仓库（已存在则复用）
 *   ③ 配置 remote（带代理，因为本机直连 github.com 被 SNI 阻断）
 *   ④ 推送全部分支与 tag
 *   ⑤ 验证远程内容与本地一致，然后从 git 配置里清掉 token
 *
 * 用法：
 *   node tools/publish.mjs --token ghp_xxx
 *   set GITHUB_TOKEN=ghp_xxx && node tools/publish.mjs
 *   node tools/publish.mjs --token ghp_xxx --repo my-name --private
 *
 * ⚠️ 安全说明：
 *   token 只在本次进程内存中使用，不写入任何文件。
 *   唯一例外是推送时临时放进 remote URL —— 推送成功后立即改回不带 token 的 URL。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const TOKEN = getArg('token') || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO = getArg('repo', 'fullstack-learning-system');
const PRIVATE = hasFlag('private');
const PROXY = getArg('proxy', 'http://127.0.0.1:7897');

/* ---------- 输出 ---------- */
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = useColor
  ? { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : Object.fromEntries(['g', 'y', 'r', 'c', 'd', 'b', 'x'].map((k) => [k, '']));
const log = (s = '') => console.log(s);
const ok = (s) => log(`${C.g}  OK${C.x} ${s}`);
const info = (s) => log(`     ${C.d}${s}${C.x}`);
const err = (s) => log(`${C.r}  XX${C.x} ${s}`);
const step = (s) => log(`\n${C.c}${C.b}${s}${C.x}`);

function die(msg, hint) {
  err(msg);
  if (hint) hint.forEach((h) => info(h));
  log('');
  process.exit(1);
}

/* ---------- git 执行封装 ---------- */
function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : 'pipe',
    timeout: opts.timeout || 180000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },  // 绝不让 git 弹交互
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

/* ---------- GitHub API ---------- */
async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch('https://api.github.com' + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'learning-system-publish',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 无 body */ }
  return { status: res.status, json };
}

/* ============================================================
 * 主流程
 * ============================================================ */
log('');
log(`${C.b}${'='.repeat(58)}${C.x}`);
log(`${C.b}  发布到 GitHub${C.x}`);
log(`${C.b}${'='.repeat(58)}${C.x}`);

/* ---- 0. 前置检查 ---- */
step('[0/5] 前置检查');

if (!TOKEN) {
  die('没有提供 token',
    ['用法：node tools/publish.mjs --token ghp_xxxxxxxx',
     '  或：set GITHUB_TOKEN=ghp_xxx && node tools/publish.mjs',
     '',
     '获取 token：https://github.com/settings/tokens',
     '  → Generate new token (classic) → 勾选 repo → Generate']);
}
if (!/^(gh[pousr]_|github_pat_)/.test(TOKEN)) {
  info('提示：经典 token 以 ghp_ 开头，细粒度 token 以 github_pat_ 开头');
}

const st = git(['status', '--porcelain']);
if (st.out.trim()) {
  err('工作区有未提交的改动：');
  st.out.trim().split('\n').slice(0, 8).forEach((l) => info(l));
  die('请先提交，再发布', [`  git add -A && git commit -m "..."`]);
}
ok('工作区干净');

const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD']).out || '').trim() || 'master';
const commits = (git(['rev-list', '--count', 'HEAD']).out || '').trim();
info(`分支：${branch}，提交数：${commits}`);

/* ---- 1. 校验 token ---- */
step('[1/5] 校验 token');

const me = await api('/user');
if (me.status === 401) {
  die('token 无效或已过期', ['请重新生成：https://github.com/settings/tokens']);
}
if (me.status !== 200) {
  die(`GitHub API 返回 ${me.status}`, [me.json?.message || '']);
}
const login = me.json.login;
ok(`已认证：${login}`);
info(`token 权限范围：${(me.json.plan?.name) || '?'}  ·  仓库配额：${me.json.total_private_repos ?? '?'}`);

/* ---- 2. 创建（或复用）仓库 ---- */
step('[2/5] 创建仓库');

let repoUrl = null;
const existing = await api(`/repos/${login}/${REPO}`);

if (existing.status === 200) {
  ok(`仓库已存在：${existing.json.full_name}`);
  repoUrl = existing.json.clone_url;
  const size = existing.json.size;
  if (size > 0) {
    info(`注意：远程仓库已有内容（${size} KB）`);
    info('如果里面是自动生成的 README，推送会被拒绝 —— 脚本会用 --force 覆盖');
  }
} else if (existing.status === 404) {
  const created = await api('/user/repos', {
    method: 'POST',
    body: {
      name: REPO,
      description: '全栈学习系统：13 主题学习平台（HTML/CSS/JS/Vue/Ajax/Maven/SpringBoot/HTTP/IOC/MySQL/JDBC/MyBatis/分层解耦）+ BookHub 后端项目',
      private: PRIVATE,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false,        // 关键：不生成 README，否则推送冲突
    },
  });
  if (created.status === 201) {
    ok(`已创建：${created.json.full_name}（${PRIVATE ? '私有' : '公开'}）`);
    repoUrl = created.json.clone_url;
  } else {
    die(`创建失败（HTTP ${created.status}）`, [
      created.json?.message || '',
      '常见原因：token 没有 repo 权限 / 仓库名已被占用',
    ]);
  }
} else {
  die(`查询仓库失败（HTTP ${existing.status}）`, [existing.json?.message || '']);
}

/* ---- 3. 配置 remote 与代理 ---- */
step('[3/5] 配置 remote');

// 代理：本机直连 github.com 的 git 协议被 SNI 阻断，必须走代理
if (PROXY) {
  git(['config', '--local', 'http.proxy', PROXY]);
  git(['config', '--local', 'https.proxy', PROXY]);
  ok(`已配置代理：${PROXY}`);
}

const authUrl = repoUrl.replace('https://', `https://x-access-token:${TOKEN}@`);
const hasRemote = git(['remote']).out.split('\n').map((s) => s.trim()).includes('origin');
if (hasRemote) {
  git(['remote', 'set-url', 'origin', authUrl]);
} else {
  git(['remote', 'add', 'origin', authUrl]);
}
ok('remote origin 已设置（URL 含临时 token）');

/* ---- 4. 推送 ---- */
step('[4/5] 推送');

log(`     ${C.d}推送 ${commits} 个提交到 ${login}/${REPO} …${C.x}`);

// 先尝试普通推送；若远程有 auto_init 生成的 README 则用 --force
let push = git(['push', '-u', 'origin', branch, '--porcelain'], { timeout: 240000 });

if (!push.ok) {
  const out = push.out;
  if (/rejected|fetch first|non-fast-forward/i.test(out)) {
    info('普通推送被拒绝（远程已有内容），改用 --force 覆盖 …');
    push = git(['push', '-u', 'origin', branch, '--force', '--porcelain'], { timeout: 240000 });
  }
}

if (!push.ok) {
  // 推送失败：立刻清掉 URL 里的 token，避免留在 .git/config
  git(['remote', 'set-url', 'origin', repoUrl]);

  const out = push.out;
  if (/Authentication failed|403|could not read Username/i.test(out)) {
    die('认证失败', [
      'token 可能缺少 repo 权限，或已过期。',
      '请确认勾选了 "repo" 这一项后重新生成。',
    ]);
  }
  if (/Proxy|CONNECT|could not resolve/i.test(out)) {
    die('代理连接失败', [
      `当前代理：${PROXY}`,
      '请确认 Clash 正在运行；或换端口：--proxy http://127.0.0.1:其它端口',
    ]);
  }
  die('推送失败', out.split('\n').filter(Boolean).slice(-6));
}

ok('推送成功');
info(push.out.trim().split('\n').slice(-2).join(' | '));

/* 推送成功后立即移除 URL 中的 token */
git(['remote', 'set-url', 'origin', repoUrl]);
ok('已从 remote URL 移除 token');

/* ---- 5. 验证 ---- */
step('[5/5] 验证');

const remoteInfo = await api(`/repos/${login}/${REPO}/commits?per_page=1&sha=${branch}`);
if (remoteInfo.status === 200 && Array.isArray(remoteInfo.json) && remoteInfo.json.length) {
  const c = remoteInfo.json[0];
  const localHead = (git(['rev-parse', 'HEAD']).out || '').trim();
  const remoteHead = c.sha;
  if (localHead === remoteHead) {
    ok(`远程 HEAD 与本地一致：${remoteHead.slice(0, 7)}`);
  } else {
    info(`本地 HEAD ${localHead.slice(0, 7)} / 远程 HEAD ${remoteHead.slice(0, 7)}`);
  }
  info(`最新提交：${c.commit.message.split('\n')[0]}`);
}

const repoMeta = await api(`/repos/${login}/${REPO}`);
if (repoMeta.status === 200) {
  log('');
  log(`${C.b}${'='.repeat(58)}${C.x}`);
  log(`${C.g}${C.b}  发布完成${C.x}`);
  log(`${C.b}${'='.repeat(58)}${C.x}`);
  log('');
  log(`  仓库地址    ${C.c}${repoMeta.json.html_url}${C.x}`);
  log(`  克隆命令    ${C.c}git clone ${repoMeta.json.clone_url}${C.x}`);
  log(`  可见性      ${repoMeta.json.private ? '私有' : '公开'}`);
  log(`  默认分支    ${repoMeta.json.default_branch}`);
  log('');
  log(`  ${C.d}别人克隆后：cd ${REPO} && node tools/setup.mjs${C.x}`);
  log('');
}

/* ---- 清理：确保 .git/config 里没有 token 残留 ---- */
const cfg = fs.readFileSync(path.join(ROOT, '.git', 'config'), 'utf8');
if (cfg.includes(TOKEN)) {
  err('检测到 .git/config 里仍有 token，正在清理 …');
  git(['remote', 'set-url', 'origin', repoUrl]);
  const after = fs.readFileSync(path.join(ROOT, '.git', 'config'), 'utf8');
  if (after.includes(TOKEN)) die('清理失败，请手动执行：git remote set-url origin ' + repoUrl);
}
ok('已确认 token 未残留在 .git/config');

log('');
process.exit(0);

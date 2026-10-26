#!/usr/bin/env node
/**
 * setup.mjs —— 首次初始化（克隆仓库后跑一次）
 * ============================================================
 * 仓库里刻意不提交这四样东西（体积大 / 本机专属）：
 *   ① tools/maven/maven-3.9.9/      Maven 发行版（11MB）
 *   ② tools/maven/repo/             Maven 本地依赖仓库（88MB）
 *   ③ learning-system/content.bundle.js   内容构建产物
 *   ④ dbserver/                     MySQL 数据目录（含你本机数据）
 *
 * 本脚本负责把它们补齐，让新克隆的人能一条命令跑起来。
 *
 * 用法：
 *   node tools/setup.mjs            # 检查并补齐
 *   node tools/setup.mjs --check    # 只检查，不下载
 *   node tools/setup.mjs --maven-only
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHECK_ONLY = process.argv.includes('--check');
const MAVEN_ONLY = process.argv.includes('--maven-only');

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : Object.fromEntries(['g', 'y', 'r', 'c', 'd', 'b', 'x'].map((k) => [k, '']));

const log = (s = '') => console.log(s);
const ok = (s) => log(`${C.g}  OK${C.x} ${s}`);
const info = (s) => log(`     ${C.d}${s}${C.x}`);
const warn = (s) => log(`${C.y}  !!${C.x} ${s}`);
const err = (s) => log(`${C.r}  XX${C.x} ${s}`);
const step = (s) => log(`${C.c}${s}${C.x}`);

const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- Maven 发行版 ----------
 * 镜像按实测可用性排序：
 *   华为云 —— 实测 200，速度快（清华/apache 官方镜像都 404）
 *   阿里云 —— 官方 apache 路径 404，但仓库可用（用于依赖下载）
 */
const MAVEN_VER = '3.9.9';
const MAVEN_MIRRORS = [
  `https://mirrors.huaweicloud.com/apache/maven/maven-3/${MAVEN_VER}/binaries/apache-maven-${MAVEN_VER}-bin.zip`,
  `https://mirrors.tuna.tsinghua.edu.cn/apache/maven/maven-3/${MAVEN_VER}/binaries/apache-maven-${MAVEN_VER}-bin.zip`,
  `https://dlcdn.apache.org/maven/maven-3/${MAVEN_VER}/binaries/apache-maven-${MAVEN_VER}-bin.zip`,
];

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100000) throw new Error(`文件过小（${buf.length} 字节），可能不是 zip`);
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/* ---------- PowerShell 解压（Windows 自带，无需 unzip 命令） ---------- */
function unzip(zipPath, destDir) {
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ], { stdio: 'pipe', timeout: 120000 });
    if (r.status !== 0) throw new Error('解压失败：' + (r.stderr || '').toString().slice(0, 200));
  } else {
    const r = spawnSync('unzip', ['-q', '-o', zipPath, '-d', destDir], { stdio: 'pipe', timeout: 120000 });
    if (r.status !== 0) throw new Error('解压失败，请安装 unzip');
  }
}

/* ============================================================
 * 主流程
 * ============================================================ */
log('');
log(`${C.b}${'='.repeat(58)}${C.x}`);
log(`${C.b}  学习系统 · 首次初始化${C.x}`);
log(`${C.b}${'='.repeat(58)}${C.x}`);
log('');

const results = [];

/* ---- 1. 环境检查 ---- */
step('[1/6] 检查环境');

function checkCmd(cmd, args, name, hint) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    err(`${name} 不可用`);
    if (hint) info(hint);
    return null;
  }
  // 注意：java -version 把版本号打到 stderr，不是 stdout
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  return out.split('\n').map((s) => s.trim()).filter(Boolean)[0] || name;
}

const nodeVer = process.version;
ok(`Node ${nodeVer}`);

const javaOut = checkCmd('java', ['-version'], 'Java',
  '需要 JDK 21+。装好后确认 PATH 里有 java。');
if (javaOut) ok(`Java（${javaOut.replace(/"/g, '').slice(0, 40)}）`);

const mysqlCandidates = [
  'D:\\MySQL Server 8.4\\bin\\mysql.exe',
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
  'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe',
];
const mysqlPath = mysqlCandidates.find((p) => fs.existsSync(p));
if (mysqlPath) ok(`MySQL 客户端：${mysqlPath}`);
else warn('未找到 mysql.exe —— 数据库相关功能不可用（学习系统本身不受影响）');
info('若你的 MySQL 装在别处，改 tools/db-up.bat 里的 BASEDIR 变量');

/* ---- 2. Maven 发行版 ---- */
step('');
step('[2/6] 检查工坊 Maven');

const mvnHome = 'tools/maven/maven-3.9.9';
if (exists(`${mvnHome}/bin/mvn.cmd`) || exists(`${mvnHome}/bin/mvn`)) {
  ok(`Maven 已就绪（${mvnHome}）`);
  results.push({ item: 'Maven', status: 'ready' });
} else if (CHECK_ONLY) {
  warn('Maven 缺失（--check 模式不下载）');
  results.push({ item: 'Maven', status: 'missing' });
} else {
  info('未找到，开始下载 Maven 3.9.9 …');
  let done = false;
  for (const u of MAVEN_MIRRORS) {
    const host = new URL(u).host;
    process.stdout.write(`     尝试 ${host} … `);
    try {
      const zip = path.join(ROOT, 'tools', 'maven', `_mvn-${Date.now()}.zip`);
      const size = await download(u, zip);
      log(`${(size / 1048576).toFixed(1)} MB`);
      fs.mkdirSync(path.join(ROOT, 'tools', 'maven'), { recursive: true });
      unzip(zip, path.join(ROOT, 'tools', 'maven'));
      fs.unlinkSync(zip);
      const extracted = path.join(ROOT, 'tools', 'maven', `apache-maven-${MAVEN_VER}`);
      if (fs.existsSync(extracted)) {
        fs.renameSync(extracted, path.join(ROOT, mvnHome));
      }
      ok('Maven 安装完成');
      results.push({ item: 'Maven', status: 'installed' });
      done = true;
      break;
    } catch (e) {
      log(`失败（${e.message}）`);
    }
  }
  if (!done) {
    err('所有镜像都失败。请手动下载：');
    info(MAVEN_MIRRORS[0]);
    info(`解压后重命名为 ${mvnHome}`);
    results.push({ item: 'Maven', status: 'failed' });
  }
}

/* ---- 2.5 Redis（可选，缓存/限流/判题不依赖但后端启动需要） ---- */
step('');
step('[3/6] 检查 Redis');

const redisExe = 'tools/redis/redis-server.exe';
if (fs.existsSync(path.join(ROOT, redisExe)) || fs.existsSync(path.join(ROOT, 'tools/redis/redis-server'))) {
  ok('Redis 已就绪（tools/redis/）');
  results.push({ item: 'Redis', status: 'ready' });
} else if (CHECK_ONLY || MAVEN_ONLY) {
  warn('Redis 缺失（--check 模式不下载）');
  info('后端启动时会因无法连接 Redis 而失败；可设 REDIS_HOST 指向已有实例');
  results.push({ item: 'Redis', status: 'missing' });
} else {
  info('未找到，尝试下载 Windows 版 Redis 5.0.14 …');
  const url = 'https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip';
  try {
    fs.mkdirSync(path.join(ROOT, 'tools/redis'), { recursive: true });
    const zip = path.join(ROOT, 'tools', `_redis-${Date.now()}.zip`);
    const size = await download(url, zip);
    log(`     ${(size / 1048576).toFixed(1)} MB`);
    unzip(zip, path.join(ROOT, 'tools/redis'));
    fs.unlinkSync(zip);
    ok('Redis 安装完成');
    results.push({ item: 'Redis', status: 'installed' });
  } catch (e) {
    err('Redis 下载失败：' + e.message);
    info('手动下载：' + url);
    info('解压到 tools/redis/ 目录即可');
    info('或使用已有的 Redis：设置环境变量 REDIS_HOST / REDIS_PORT');
    results.push({ item: 'Redis', status: 'failed' });
  }
}

/* ---- 3. 内容打包 ---- */
step('');
step('[4/6] 打包学习内容');

if (exists('learning-system/content.bundle.js')) {
  const size = fs.statSync(path.join(ROOT, 'learning-system/content.bundle.js')).size;
  ok(`内容已打包（${(size / 1024).toFixed(0)} KB）`);
  results.push({ item: '内容', status: 'ready' });
} else {
  info('未找到 content.bundle.js，开始构建 …');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-content.mjs')], {
    stdio: 'inherit', cwd: ROOT,
  });
  if (r.status === 0) {
    ok('内容打包完成');
    results.push({ item: '内容', status: 'built' });
  } else {
    err('内容打包失败（见上方输出）');
    results.push({ item: '内容', status: 'failed' });
  }
}

/* ---- 4. Maven 依赖（可选，耗时） ---- */
step('');
step('[5/6] 检查 Maven 依赖仓库');

const repoDir = 'tools/maven/repo';
const repoReady = exists(repoDir) && fs.readdirSync(path.join(ROOT, repoDir)).length > 5;

if (repoReady) {
  const size = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-ChildItem -Recurse '${path.join(ROOT, repoDir)}' -File | Measure-Object Length -Sum).Sum`],
    { encoding: 'utf8' }).stdout?.trim();
  const mb = size ? (Number(size) / 1048576).toFixed(0) : '?';
  ok(`依赖仓库已存在（${mb} MB）`);
  results.push({ item: '依赖', status: 'ready' });
} else if (CHECK_ONLY || MAVEN_ONLY) {
  warn('依赖仓库为空 —— 首次 mvnw 运行会自动下载（约 70MB）');
  results.push({ item: '依赖', status: 'missing' });
} else {
  info('依赖仓库为空。是否现在预下载？（约 70MB，首次运行 mvnw 时也会自动下载）');
  info('跳过：直接运行 mvnw.cmd test 时会自动补齐');
  results.push({ item: '依赖', status: 'lazy' });
}

/* ---- 5. 数据库 ---- */
step('');
step('[6/6] 检查数据库');

if (exists('dbserver/data')) {
  ok('数据库数据目录已存在');
  results.push({ item: '数据库', status: 'ready' });
} else {
  info('未初始化。运行 tools\\db-up.bat 会自动创建并导入数据。');
  results.push({ item: '数据库', status: 'pending' });
}

/* ---- 总结 ---- */
log('');
log(`${C.b}${'='.repeat(58)}${C.x}`);
const failed = results.filter((r) => r.status === 'failed');
if (failed.length === 0) {
  log(`${C.g}${C.b}  初始化完成${C.x}`);
  log('');
  log('  下一步：');
  log('');
  log(`    ${C.c}只要看学习内容${C.x}   双击 learning-system/index.html`);
  log(`    ${C.c}完整启动${C.x}         双击 一键启动.bat`);
  log(`    ${C.c}只跑后端${C.x}         cd project/bookhub && mvnw.cmd spring-boot:run`);
  log(`    ${C.c}验证安装${C.x}         node tools/verify.mjs`);
  log('');
} else {
  log(`${C.r}${C.b}  ${failed.length} 项失败${C.x}`);
  failed.forEach((f) => log(`  · ${f.item}`));
  log('');
}
log(`${C.b}${'='.repeat(58)}${C.x}`);
log('');

process.exitCode = failed.length ? 1 : 0;

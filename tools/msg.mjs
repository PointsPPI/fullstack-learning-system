#!/usr/bin/env node
/**
 * msg.mjs —— 中文提示输出器（文案集中在 messages.json）
 * ============================================================
 * 为什么中文不写在 .bat 里？
 *
 *   cmd.exe 的批处理解析器有一个固有缺陷：
 *     开启 chcp 65001 之后，它按「字节偏移」增量读取批处理文件。
 *     UTF-8 一个中文字符占 3 字节，读取位置会落到字符中间，
 *     于是 `REM 中文注释` 或 `echo 中文` 被从中间劈开，
 *     后半截被当成命令执行，报：
 *       '鍏ㄦ爤瀛︿範绯荤粺' is not recognized as an internal or external command
 *
 *   这跟「文件是 UTF-8 还是 GBK」无关 —— 只要 .bat 里出现非 ASCII
 *   字符且开了 UTF-8 代码页，就可能触发。改编码治不好。
 *   实测三种组合（UTF-8无BOM / UTF-8带BOM / GBK）都会复发。
 *
 * 所以：
 *   .bat 只写纯 ASCII，所有中文文案集中在 tools/messages.json，
 *   由本脚本读取并输出。node 处理 UTF-8 是可靠的。
 *
 * 用法（由 .bat 调用）：
 *   node tools/msg.mjs <key> [k1=v1 k2=v2 ...]
 *   node tools/msg.mjs banner <key>                 横幅
 *   node tools/msg.mjs err    <key>                 错误
 *   node tools/msg.mjs raw    "任意文本"            直接输出
 *   node tools/msg.mjs urls                         网址清单
 *   node tools/msg.mjs dbready <port>               数据库就绪信息
 *
 * 示例：
 *   node tools/msg.mjs start.java_ok
 *   node tools/msg.mjs db.check_port port=3307
 *   node tools/msg.mjs err err.no_java
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MSG_FILE = path.join(__dirname, 'messages.json');

/* ---------- 读取文案表 ---------- */
let MSG = {};
try {
  MSG = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8').replace(/^\uFEFF/, ''));
} catch (e) {
  // 文案表坏了也要能输出，不能因为提示失败导致脚本整体挂掉
  process.stderr.write(`[msg.mjs] 无法读取 messages.json: ${e.message}\n`);
}

/* ---------- 颜色（保守启用） ----------
 * 颜色只是锦上添花，中文正确输出才是根本。
 * 默认策略：非 TTY（被重定向/管道）或旧 conhost 一律不加色，
 * 免得用户看到 \x1b[34m 这类乱码。
 */
function colorEnabled() {
  if (process.env.LS_COLOR === '1') return true;
  if (process.env.LS_COLOR === '0') return false;
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.WT_SESSION) return true;        // Windows Terminal
  if (process.env.TERM_PROGRAM) return true;      // VSCode / iTerm
  if (process.platform !== 'win32') return true;
  return false;                                    // 旧 conhost：不加色
}

const USE_COLOR = colorEnabled();
const K = ['reset', 'dim', 'bold', 'green', 'yellow', 'red', 'cyan', 'blue'];
const C = USE_COLOR
  ? {
      reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
      green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
      cyan: '\x1b[36m', blue: '\x1b[34m',
    }
  : Object.fromEntries(K.map((k) => [k, '']));

const line = (s = '') => process.stdout.write(s + '\n');

/* ---------- 参数 ---------- */
const [, , cmd, ...rest] = process.argv;

/** 把 "k1=v1 k2=v2" 解析成对象，并做 {k} 替换 */
function fill(tpl, pairs) {
  if (!tpl) return '';
  let out = String(tpl);
  pairs.forEach((p) => {
    const eq = p.indexOf('=');
    if (eq < 0) return;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    out = out.split(`{${k}}`).join(v);
  });
  return out;
}

/** 取文案：找不到 key 时回落到 key 本身，便于发现拼错 */
const T = (key, pairs = []) => (MSG[key] ? fill(MSG[key], pairs) : `[missing:${key}]`);

/* ---------- 输出 ---------- */
switch (cmd) {
  /* ----- 分节横幅 ----- */
  case 'banner': {
    const t = T(rest[0], rest.slice(1));
    line('');
    line(`${C.blue}${'='.repeat(60)}${C.reset}`);
    line(`${C.bold}  ${t}${C.reset}`);
    line(`${C.blue}${'='.repeat(60)}${C.reset}`);
    line('');
    break;
  }

  /* ----- 单行普通提示 ----- */
  case 'step':
    line(`${C.cyan}${T(rest[0], rest.slice(1))}${C.reset}`);
    break;

  /* ----- 成功 ----- */
  case 'ok':
    line(`${C.green}${C.bold}  OK${C.reset} ${T(rest[0], rest.slice(1))}`);
    break;

  /* ----- 错误 ----- */
  case 'err':
    line(`${C.red}[X] ${T(rest[0], rest.slice(1))}${C.reset}`);
    break;

  /* ----- 警告 ----- */
  case 'warn':
    line(`${C.yellow}!!  ${T(rest[0], rest.slice(1))}${C.reset}`);
    break;

  /* ----- 次要信息（缩进灰色） ----- */
  case 'info':
    line(`       ${C.dim}${T(rest[0], rest.slice(1))}${C.reset}`);
    break;

  /* ----- 直接输出任意文本（不经文案表） ----- */
  case 'raw':
    line(rest.join(' '));
    break;

  /* ----- 网址清单 ----- */
  case 'urls': {
    // 中文占 2 个显示宽度，所以不能按 .length 算
    const dispWidth = (str) => [...str].reduce((w, ch) => w + (/[一-鿿＀-￯]/.test(ch) ? 2 : 1), 0);
    const pad = (k) => ' '.repeat(Math.max(0, 10 - dispWidth(T(k))));
    line('');
    line(`${C.blue}${'='.repeat(60)}${C.reset}`);
    line(`${C.bold}  ${T('urls.title')}${C.reset}`);
    line(`${C.blue}${'='.repeat(60)}${C.reset}`);
    line('');
    line(`  ${C.cyan}${T('urls.study')}${C.reset}${pad('urls.study')}http://127.0.0.1:5173/learning-system/`);
    line(`  ${C.cyan}${T('urls.practice')}${C.reset}${pad('urls.practice')}http://127.0.0.1:5173/learning-system/#/practice`);
    line(`  ${C.cyan}${T('urls.judge')}${C.reset}${pad('urls.judge')}http://127.0.0.1:5173/learning-system/#/practice/binary-search`);
    line(`  ${C.cyan}${T('urls.journey')}${C.reset}${pad('urls.journey')}http://127.0.0.1:5173/labs/web/01-request-journey.html`);
    line(`  ${C.cyan}${T('urls.api')}${C.reset}${pad('urls.api')}http://127.0.0.1:8080/api/books`);
    line('');
    line(`  ${C.dim}${T('urls.log')}${C.reset}`);
    line(`  ${C.dim}${T('urls.stop_backend')}${C.reset}`);
    line(`  ${C.dim}${T('urls.stop_db')}${C.reset}`);
    line('');
    line(`${C.blue}${'='.repeat(60)}${C.reset}`);
    break;
  }

  /* ----- 数据库就绪 ----- */
  case 'dbready': {
    const port = rest[0] || '3307';
    // 图书数量由 bat 侧 mysql 查询写入临时文件（避免中文出现在 bat 里）
    let count = '?';
    try {
      const tmp = path.join(process.env.TEMP || '/tmp', 'ls_bookcount.txt');
      count = fs.readFileSync(tmp, 'utf8').trim() || '?';
    } catch { /* 读不到就显示 ? */ }

    line('');
    line(`${C.green}${C.bold}  OK  ${T('db.ready')}${C.reset}`);
    line(`       host=127.0.0.1  port=${port}  user=bh  password=bh_pwd_2026  db=bookhub`);
    line(`       ${fill(T('db.rows'), [`count=${count}`])}`);
    line('');
    line(`       ${C.dim}${T('db.stop_hint')}${C.reset}`);
    break;
  }

  /* ----- 兜底：当作 key 直接输出 ----- */
  default:
    if (!cmd) {
      line('');
      line('用法: node tools/msg.mjs <key|banner|step|ok|err|warn|info|raw|urls|dbready> [k=v ...]');
      line('');
      process.exitCode = 1;
    } else {
      line(T(cmd, rest));
    }
}

process.exitCode = 0;

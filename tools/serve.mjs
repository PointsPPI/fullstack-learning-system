#!/usr/bin/env node
/**
 * serve.mjs — 本地静态服务器
 * ------------------------------------------------------------
 * 为什么需要它？
 *   浏览器出于安全策略，在 file:// 协议下禁止 fetch() 读取本地文件
 *   （报错：CORS policy / URL scheme "file" is not supported）。
 *   所以凡是「页面要发 Ajax 读 json/md」的实验，都必须走 http://。
 *
 * 用法：
 *   node tools/serve.mjs              # 默认端口 5173，根目录 = 工坊根
 *   node tools/serve.mjs 8080         # 指定端口
 *   node tools/serve.mjs 8080 labs    # 指定端口 + 指定根目录
 *
 * 特性：
 *   - 零依赖（只用 node 内置 http/fs/path）
 *   - 正确的 MIME（.mjs/.js → text/javascript，.json → application/json）
 *   - UTF-8 强制（避免中文乱码）
 *   - 目录自动补 index.html
 *   - 端口占用自动 +1 重试
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const argPort = Number(process.argv[2]) || 5173;
const rootArg = process.argv[3];
const ROOT = path.resolve(__dirname, '..', rootArg || '.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.opml': 'text/xml; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.java': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // 只接受 GET/HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('405 Method Not Allowed —— 本服务器只服务静态文件');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }

  // 防目录穿越：解析后的路径必须仍在 ROOT 内
  let filePath = path.join(ROOT, pathname);
  if (!path.resolve(filePath).startsWith(path.resolve(ROOT))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      // 目录：补 index.html
      const idx = path.join(filePath, 'index.html');
      if (fs.existsSync(idx)) return sendFile(idx, res);
      // 没有 index.html 就列出目录（方便浏览 labs 目录）
      return listDir(filePath, pathname, res);
    }
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<meta charset="utf-8"><h1>404</h1><p>找不到：${pathname}</p>
        <p>根目录：${ROOT}</p><p><a href="/">回到首页</a></p>`);
    }
    sendFile(filePath, res);
  });
});

function sendFile(fp, res) {
  const ext = path.extname(fp).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(fp);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache', // 学习场景：永远读最新，不要缓存
  });
  fs.createReadStream(fp).pipe(res);
}

function listDir(dir, pathname, res) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const rows = items
    .map((d) => {
      const name = d.name + (d.isDirectory() ? '/' : '');
      const href = path.posix.join(pathname, d.name) + (d.isDirectory() ? '/' : '');
      return `<li><a href="${href}">${name}</a></li>`;
    })
    .join('\n');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${pathname}</title>
    <style>body{font:15px/1.7 system-ui;padding:24px;max-width:900px;margin:auto}
    li{margin:4px 0}a{color:#0b5fff;text-decoration:none}a:hover{text-decoration:underline}</style>
    <h2>目录：${pathname}</h2><ul>${rows}</ul>`);
}

function listen(port, tries = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 12) {
      console.log(`  端口 ${port} 被占用，尝试 ${port + 1} …`);
      return listen(port + 1, tries + 1);
    }
    console.error('启动失败：', e.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('  ✅ 静态服务器已启动');
    console.log(`     地址：http://127.0.0.1:${port}/`);
    console.log(`     根目录：${ROOT}`);
    console.log('');
    console.log('  常用入口：');
    console.log(`     📚 学习系统      http://127.0.0.1:${port}/learning-system/`);
    console.log(`     🧪 请求旅程实验  http://127.0.0.1:${port}/labs/web/01-request-journey.html`);
    console.log(`     🧪 图书管理实验  http://127.0.0.1:${port}/labs/web/02-book-crud.html`);
    console.log(`     🔌 后端接口      http://127.0.0.1:8080/api/books`);
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');
  });
}

console.log(`  启动静态服务器…（根目录 ${ROOT}）`);
listen(argPort);

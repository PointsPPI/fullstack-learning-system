/* ============================================================
 * markdown.js —— Markdown 渲染器（带增强）
 * ------------------------------------------------------------
 * 用 marked 做基础渲染，再补三层增强，让「为学习而写」的 Markdown 更好用：
 *
 *   1. 代码块 → 语法高亮 + 语言标签 + 复制按钮 + 行号
 *   2. 自定义容器  ::: tip / warn / danger / key / compare
 *      → 彩色提示框。这是把「重点」从正文里视觉上拎出来的关键。
 *   3. 标题锚点 → 自动生成 id，供右侧目录跳转
 *
 * 另外：链接里如果指向 learning-system 外部（.md 文件、lab 目录），
 * 转成「打开原始文件 / 在新标签打开实验」按钮，避免死链。
 * ============================================================ */
(function () {
  'use strict';

  if (window.marked) {
    // marked 15 的 umd 全局名是 marked
    window.marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: false,   // 我们自己生成锚点，避免重复
      mangle: false,
    });
  }

  /* ---------- 自定义容器预处理 ----------
   * ::: tip 标题
   * 正文
   * :::
   * → <div class="callout tip"><div class="callout-t"><i>💡</i>标题</div>...</div>
   */
  const CALLOUT_META = {
    tip: { icon: '💡', label: '要点' },
    key: { icon: '🔑', label: '核心' },
    warn: { icon: '⚠️', label: '注意' },
    danger: { icon: '🚫', label: '坑点' },
    compare: { icon: '⚖️', label: '对比' },
    why: { icon: '❓', label: '为什么' },
    lab: { icon: '🧪', label: '动手' },
    interview: { icon: '🎤', label: '面试' },
    note: { icon: '📝', label: '旁注' },
  };

  function preprocessContainers(md) {
    const lines = md.split('\n');
    const out = [];
    const stack = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const open = line.match(/^:::\s*([a-z]+)?\s*(.*)$/);
      if (open && !/^:::\s*$/.test(line)) {
        const type = open[1] || 'note';
        const title = open[2] || (CALLOUT_META[type]?.label ?? type);
        const meta = CALLOUT_META[type] || { icon: '📌', label: type };
        stack.push(type);
        out.push(`<div class="callout ${type}" data-callout="${type}">`);
        out.push(`<div class="callout-t"><span class="callout-i">${meta.icon}</span>${escapeHtml(title)}</div>`);
        out.push('');
        continue;
      }
      if (/^:::\s*$/.test(line) && stack.length) {
        stack.pop();
        out.push('');
        out.push('</div>');
        continue;
      }
      out.push(line);
    }
    // 未闭合的容器补上，避免整篇布局崩
    while (stack.length) { stack.pop(); out.push('</div>'); }
    return out.join('\n');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ---------- slug：中文标题也生成可用锚点 ---------- */
  let slugCache = new Map();
  function slugify(text, idx) {
    const base = String(text)
      .trim()
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[`~!@#$%^&*()+=[\]{}|\\:;"'<>,.?/·。，、；：？！“”‘’（）【】《》]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || `h${idx}`;
    const n = (slugCache.get(base) || 0) + 1;
    slugCache.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  }

  /* ---------- 主渲染 ---------- */
  function render(md, opts = {}) {
    slugCache = new Map();
    if (!window.marked) {
      return `<pre class="raw-md">${escapeHtml(md)}</pre>`;
    }
    const prepared = preprocessContainers(md);
    const html = window.marked.parse(prepared);

    const div = document.createElement('div');
    div.innerHTML = html;

    // 1) 标题加锚点 + 收集目录
    const toc = [];
    div.querySelectorAll('h1,h2,h3,h4').forEach((h, i) => {
      const text = h.textContent.trim();
      const id = slugify(text, i);
      h.id = id;
      h.classList.add('md-h');
      h.dataset.level = h.tagName.slice(1);
      // 悬停时显示 # 链接按钮
      const a = document.createElement('a');
      a.className = 'anchor';
      a.href = '#' + id;
      a.textContent = '#';
      a.setAttribute('aria-label', '复制锚点');
      h.appendChild(a);
      toc.push({ id, text, level: Number(h.tagName.slice(1)) });
    });

    // 2) 表格包一层，移动端可横向滚动
    div.querySelectorAll('table').forEach((t) => {
      if (t.parentElement.classList.contains('table-wrap')) return;
      const w = document.createElement('div');
      w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    // 3) 代码块增强
    div.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
      const lang = cls ? cls.replace('language-', '') : '';
      const raw = code.textContent;

      // 高亮
      if (window.hljs) {
        try {
          if (lang && window.hljs.getLanguage(lang)) {
            code.innerHTML = window.hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
          } else {
            code.innerHTML = window.hljs.highlightAuto(raw).value;
          }
          code.classList.add('hljs');
        } catch { /* 高亮失败不影响阅读 */ }
      }

      const wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      const bar = document.createElement('div');
      bar.className = 'code-bar';
      bar.innerHTML = `<span class="code-lang">${escapeHtml(lang || 'text')}</span>`;
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(raw);
          btn.textContent = '已复制 ✓';
          btn.classList.add('ok');
          setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('ok'); }, 1400);
        } catch {
          // file:// 下 clipboard 可能不可用 → 降级为选中文本
          const r = document.createRange();
          r.selectNodeContents(code);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          btn.textContent = '已选中，按 Ctrl+C';
        }
      });
      bar.appendChild(btn);
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(bar);
      wrap.appendChild(pre);
      pre.classList.add('code-pre');
      if (window.LS?.store?.state().settings.codeWrap) pre.classList.add('wrap');
    });

    // 4) 站内链接改写
    div.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^https?:/i.test(href)) {
        if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
        return;
      }
      // 相对路径的 .md → 尝试当主题 key 处理，否则标注为「原始文件」
      if (/\.md$/i.test(href) && !href.includes('/')) {
        const guess = href.replace(/\.md$/i, '');
        if (window.LS?.content?.index?.[guess]) {
          a.href = '#/topic/' + guess;
          a.classList.add('internal-link');
          return;
        }
      }
      a.classList.add('file-link');
      a.title = '本地文件：' + href + '（在编辑器或文件管理器中打开）';
    });

    return { html: div.innerHTML, toc };
  }

  /* ---------- 纯文本提取（搜索索引 / 摘要） ---------- */
  function toPlainText(md, maxLen = 240) {
    const t = String(md)
      .replace(/^:::.*$/gm, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/[*_~>|-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
  }

  window.LS = window.LS || {};
  window.LS.md = { render, toPlainText, escapeHtml };
})();

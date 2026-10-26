/* ============================================================
 * playground.js —— 在线代码编辑器（自研，零依赖）
 * ------------------------------------------------------------
 * 为什么不用 CodeMirror / Monaco？
 *   ① 体积：Monaco 约 5MB，CodeMirror 约 300KB —— 我们的站点是离线单页
 *   ② 依赖：需要打包器或 UMD 构建，与「双击 index.html 就能用」冲突
 *   ③ 需求：我们只需要「行号 + 等宽字体 + Tab 缩进 + 自动配括号」
 *      这四件事，200 行纯 JS 足够
 *
 * 实现原理（这本身就是一个不错的 JS 教学案例）：
 *   · 用 <textarea> 接收输入（原生支持光标、选区、输入法、撤销）
 *   · 用 <div> 渲染行号，与 textarea 同步滚动
 *   · Tab 键拦截，插入空格而不是跳转焦点
 *   · 自动缩进：回车时保持上一行的缩进；遇到 { 自动 +4
 *   · 自动配对：输入 ( [ { " 时自动补右侧
 *
 * 为什么用 textarea 而不是 contenteditable？
 *   textarea 有原生撤销栈（Ctrl+Z）、原生输入法支持、原生选区拖拽。
 *   contenteditable 要实现这些都很麻烦，而且在移动端输入法上有坑。
 * ============================================================ */
(function () {
  'use strict';

  const TAB = '    ';   // 4 空格缩进

  /**
   * 创建一个编辑器实例。
   *
   * @param {HTMLElement} host 挂载点
   * @param {Object} opts { value, readOnly, onChange, onRun }
   */
  function createEditor(host, opts = {}) {
    host.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'pg-editor';

    /* ---------- 顶部栏 ---------- */
    const bar = document.createElement('div');
    bar.className = 'pg-bar';
    const title = document.createElement('span');
    title.className = 'pg-title';
    title.textContent = opts.title || '代码编辑器';
    const lang = document.createElement('span');
    lang.className = 'pg-lang';
    lang.textContent = 'java';
    bar.appendChild(title);
    bar.appendChild(lang);

    /* ---------- 代码区 ---------- */
    const codeWrap = document.createElement('div');
    codeWrap.className = 'pg-code-wrap';

    const gutter = document.createElement('div');
    gutter.className = 'pg-gutter';

    const ta = document.createElement('textarea');
    ta.className = 'pg-code';
    ta.value = opts.value || '';
    ta.spellcheck = false;
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('aria-label', '代码编辑器');
    if (opts.readOnly) ta.readOnly = true;

    codeWrap.appendChild(gutter);
    codeWrap.appendChild(ta);

    /* ---------- 操作栏 ---------- */
    const actions = document.createElement('div');
    actions.className = 'pg-actions';

    const btnRun = document.createElement('button');
    btnRun.className = 'btn btn-primary';
    btnRun.type = 'button';
    btnRun.textContent = opts.runLabel || '▶ 运行';
    btnRun.title = 'Ctrl+Enter';

    const btnReset = document.createElement('button');
    btnReset.className = 'btn';
    btnReset.type = 'button';
    btnReset.textContent = '↺ 重置';

    const btnFormat = document.createElement('button');
    btnFormat.className = 'btn';
    btnFormat.type = 'button';
    btnFormat.textContent = '⌘ 整理缩进';
    btnFormat.title = '把每行开头统一成 4 空格倍数';

    const hintKey = document.createElement('span');
    hintKey.className = 'pg-hint-key spacer';
    hintKey.textContent = 'Tab 缩进 · Ctrl+Enter 运行';

    actions.appendChild(btnRun);
    actions.appendChild(btnReset);
    actions.appendChild(btnFormat);
    actions.appendChild(hintKey);

    wrap.appendChild(bar);
    wrap.appendChild(codeWrap);
    wrap.appendChild(actions);
    host.appendChild(wrap);

    /* ============================================================
     * 行号渲染
     * ============================================================ */
    function renderGutter() {
      const lines = ta.value.split('\n');
      const n = lines.length;
      // 只在行数变化时重建 DOM（性能）
      if (gutter.childElementCount !== n) {
        gutter.innerHTML = '';
        for (let i = 1; i <= n; i++) {
          const d = document.createElement('div');
          d.textContent = String(i);
          gutter.appendChild(d);
        }
      }
      syncScroll();
    }

    function syncScroll() {
      gutter.scrollTop = ta.scrollTop;
      // 高亮光标所在行
      const pos = ta.selectionStart;
      const lineIdx = ta.value.slice(0, pos).split('\n').length - 1;
      const kids = gutter.children;
      for (let i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('on', i === lineIdx);
      }
    }

    /* ============================================================
     * 编辑增强
     * ============================================================ */
    const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };

    ta.addEventListener('keydown', (e) => {
      const s = ta.selectionStart;
      const ep = ta.selectionEnd;
      const val = ta.value;

      /* --- Tab：插入 4 空格（或对选中多行整体缩进） --- */
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (s !== ep) {
          // 多行缩进
          const lineStart = val.lastIndexOf('\n', s - 1) + 1;
          const block = val.slice(lineStart, ep);
          const shifted = block.replace(/^/gm, TAB);
          ta.setRangeText(shifted, lineStart, ep, 'select');
          ta.selectionStart = s + TAB.length;
          ta.selectionEnd = ep + TAB.length * block.split('\n').length;
        } else {
          ta.setRangeText(TAB, s, ep, 'end');
        }
        triggerChange();
        return;
      }

      /* --- Shift+Tab：减少缩进 --- */
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', s - 1) + 1;
        const lineEnd = val.indexOf('\n', ep) === -1 ? val.length : val.indexOf('\n', ep);
        const block = val.slice(lineStart, lineEnd);
        const unshifted = block.replace(/^(    |\t)/gm, '');
        ta.setRangeText(unshifted, lineStart, lineEnd, 'end');
        triggerChange();
        return;
      }

      /* --- Enter：保持缩进，遇到 { 自动加一层 --- */
      if (e.key === 'Enter') {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', s - 1) + 1;
        const curLine = val.slice(lineStart, s);
        const indent = (curLine.match(/^[ \t]*/) || [''])[0];
        const lastChar = curLine.trimEnd().slice(-1);

        // 如果光标在 { 和 } 之间，回车后自动多一层缩进 + 换行放 }
        const nextChar = val.slice(ep, ep + 1);
        if (lastChar === '{' && nextChar === '}') {
          const insert = '\n' + indent + TAB + '\n' + indent;
          ta.setRangeText(insert, s, ep, 'end');
          // 光标移到中间那行
          ta.selectionStart = ta.selectionEnd = s + 1 + indent.length + TAB.length;
        } else if (lastChar === '{') {
          ta.setRangeText('\n' + indent + TAB, s, ep, 'end');
        } else {
          ta.setRangeText('\n' + indent, s, ep, 'end');
        }
        triggerChange();
        return;
      }

      /* --- 自动配对：输入左括号/引号时补右侧 --- */
      if (PAIRS[e.key] && s === ep) {
        const nextChar = val.slice(s, s + 1);
        // 如果右边已经是相同的闭合符，跳过而不重复插入
        if (nextChar === PAIRS[e.key] && e.key !== '"' && e.key !== "'") return;
        e.preventDefault();
        ta.setRangeText(e.key + PAIRS[e.key], s, ep, 'end');
        ta.selectionStart = ta.selectionEnd = s + 1;
        triggerChange();
        return;
      }

      /* --- 输入右括号时，若右边正好是它，直接跳过（不重复插入） --- */
      if ([')', ']', '}'].includes(e.key) && s === ep) {
        if (val.slice(s, s + 1) === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = s + 1;
          return;
        }
      }

      /* --- Ctrl+Enter：运行 --- */
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (opts.onRun) opts.onRun(getValue());
        return;
      }

      /* --- Ctrl+/ ：注释/取消注释当前行 --- */
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleComment();
        return;
      }
    });

    ta.addEventListener('input', () => {
      renderGutter();
      triggerChange();
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('click', syncScroll);
    ta.addEventListener('keyup', syncScroll);

    /* ---------- 注释切换 ---------- */
    function toggleComment() {
      const s = ta.selectionStart;
      const ep = ta.selectionEnd;
      const val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      let lineEnd = val.indexOf('\n', ep);
      if (lineEnd === -1) lineEnd = val.length;

      const block = val.slice(lineStart, lineEnd);
      const lines = block.split('\n');

      // 全都有 // 就去掉，否则全加
      const allCommented = lines.every((l) => l.trim() === '' || l.trimStart().startsWith('//'));
      const newLines = lines.map((l) => {
        if (l.trim() === '') return l;
        if (allCommented) return l.replace(/^(\s*)\/\/ ?/, '$1');
        return l.replace(/^(\s*)/, '$1// ');
      });

      ta.setRangeText(newLines.join('\n'), lineStart, lineEnd, 'end');
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + newLines.join('\n').length;
      triggerChange();
    }

    /* ---------- 整理缩进 ---------- */
    function formatIndent() {
      const val = ta.value;
      let depth = 0;
      const out = val.split('\n').map((raw) => {
        const t = raw.trim();
        if (t === '') { return ''; }
        // 以 } 或 ) 或 ] 开头的行先减一层
        const startsWithCloser = /^[}\])]/.test(t);
        if (startsWithCloser && depth > 0) depth--;
        const line = TAB.repeat(depth) + t;
        // 统计这一行里的开闭括号增减
        const opens = (t.match(/[{(\[]/g) || []).length;
        const closes = (t.match(/[})\]]/g) || []).length;
        depth += opens - closes;
        if (depth < 0) depth = 0;
        return line;
      });
      // 保留末尾换行
      ta.value = out.join('\n') + (val.endsWith('\n') ? '\n' : '');
      renderGutter();
      triggerChange();
    }

    function triggerChange() {
      if (opts.onChange) opts.onChange(ta.value, { errors: null });
    }

    /* ---------- 按钮事件 ---------- */
    btnRun.addEventListener('click', () => {
      if (opts.onRun) opts.onRun(getValue());
    });
    btnReset.addEventListener('click', () => {
      ta.value = opts.value || '';
      renderGutter();
      triggerChange();
    });
    btnFormat.addEventListener('click', formatIndent);

    /* ---------- 对外 API ---------- */
    function getValue() { return ta.value; }
    function setValue(v) {
      ta.value = v;
      renderGutter();
      triggerChange();
    }
    function setBusy(busy) {
      btnRun.disabled = busy;
      btnRun.textContent = busy ? '运行中…' : (opts.runLabel || '▶ 运行');
    }
    function focus() { ta.focus(); }
    function setTitle(t) { title.textContent = t; }

    renderGutter();

    return { getValue, setValue, setBusy, focus, setTitle, element: wrap, textarea: ta };
  }

  window.LS = window.LS || {};
  window.LS.playground = { createEditor };
})();

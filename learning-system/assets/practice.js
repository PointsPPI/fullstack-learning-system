/* ============================================================
 * practice.js —— 练习场：在线运行 + 编程题判分
 * ------------------------------------------------------------
 * 两个视图：
 *   /practice            自由练习（写代码 → 运行 → 看输出）
 *   /practice/:problemId 编程题（写代码 → 判题 → 看每例结果）
 *
 * 设计原则：
 *   ① 判题结果必须"可诊断" —— 不只说"错了"，要说
 *      "哪个用例、输入什么、期望什么、你输出什么"
 *   ② 运行与判题分开 —— 自由练习要快（单例），判题要严（多例）
 *   ③ 后端不可用时优雅降级 —— 教学场景很多人在没启动后端时看内容
 * ============================================================ */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };
  const esc = window.LS.md.escapeHtml;

  /* ---------- 后端地址（可在页面上改） ---------- */
  function apiBase() {
    return (localStorage.getItem('ls.apiBase') || 'http://127.0.0.1:8080').replace(/\/$/, '');
  }

  /* ---------- 统一请求 ---------- */
  let pending = null;
  async function api(path, body, timeout = 20000) {
    const controller = new AbortController();
    pending?.abort();
    pending = controller;
    const timer = setTimeout(() => controller.abort('timeout'), timeout);

    try {
      const res = await fetch(apiBase() + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`);
      }
      if (json && json.code !== 0) {
        throw Object.assign(new Error(json.message), { code: json.code, data: json.data });
      }
      return json?.data ?? null;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw Object.assign(new Error(e.message === 'timeout' ? '请求超时' : '已取消'), { kind: 'abort' });
      }
      if (e.message === 'Failed to fetch' || e instanceof TypeError) {
        throw Object.assign(
          new Error('无法连接评测服务。请确认后端已启动（project/bookhub → mvnw.cmd spring-boot:run）'),
          { kind: 'network' }
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = null;
    }
  }

  /* ---------- 默认示例代码 ---------- */
  const DEFAULT_CODE = `public class Main {
    public static void main(String[] args) {
        // 在这里写你的 Java 代码，然后点「运行」
        System.out.println("Hello, 学习系统!");

        // 试一试：
        // 1. 改成死循环 while(true){} 看看超时提示
        // 2. 删掉一个分号看看编译错误长什么样
        // 3. 写一个 for 循环打印 1 到 10
    }
}`;

  const DEFAULT_STDIN = '';

  /* ============================================================
   * 视图 1：自由练习
   * ============================================================ */
  function viewPlayground(navigate) {
    const page = el('div', { class: 'page' });

    /* ---- 头部 ---- */
    page.appendChild(el('div', { class: 'topic-hero' },
      el('div', { class: 'hero-meta' },
        el('span', { class: 'badge brand' }, '🧪 练习场'),
        el('span', {}, '改动代码 → 点运行 → 立刻看到结果')
      ),
      el('h1', {}, '在线代码运行'),
      el('p', { class: 'lede' },
        '在浏览器里直接运行 Java 代码。每次运行在独立进程中进行，' +
        '带超时与输出上限保护 —— 写死循环也不会把电脑卡死。')
    ));

    /* ---- 后端状态 ---- */
    const statusBox = el('div', { class: 'msg warn show' }, '正在检测评测服务…');
    page.appendChild(statusBox);

    /* ---- 主布局 ---- */
    const pg = el('div', { class: 'pg' });

    /* 左：编辑器 */
    const editorHost = el('div', {});
    pg.appendChild(editorHost);

    /* 右：输出区 */
    const outCol = el('div', { class: 'pg-out' });

    // 输出面板
    const outPanel = el('div', { class: 'pg-panel' });
    const outHead = el('div', { class: 'pg-panel-head' },
      el('span', {}, '运行结果'),
      el('span', { class: 'pg-status idle' }, '待运行')
    );
    const term = el('div', { class: 'pg-term' });
    outPanel.appendChild(outHead);
    outPanel.appendChild(term);

    // 编译错误面板（默认隐藏）
    const compilePanel = el('div', { class: 'pg-panel hidden' });
    const compileHead = el('div', { class: 'pg-panel-head' }, el('span', {}, '编译错误'));
    const compileBody = el('div', { class: 'pg-compile' });
    compilePanel.appendChild(compileHead);
    compilePanel.appendChild(compileBody);

    // 输入面板
    const stdinPanel = el('div', { class: 'pg-panel' });
    const stdinHead = el('div', { class: 'pg-panel-head' },
      el('span', {}, '标准输入 (stdin)'),
      el('span', { class: 'pg-status idle', style: 'font-size:11px' }, '可选')
    );
    const stdinTa = el('textarea', {
      class: 'pg-term',
      style: 'min-height:60px;resize:vertical;border:0;outline:none;width:100%;display:block',
      placeholder: '如果程序需要读取输入，写在这里（如 Scanner 读的数据）',
      spellcheck: 'false',
    });
    stdinPanel.appendChild(stdinHead);
    stdinPanel.appendChild(stdinTa);

    outCol.appendChild(outPanel);
    outCol.appendChild(compilePanel);
    outCol.appendChild(stdinPanel);
    pg.appendChild(outCol);

    page.appendChild(pg);

    /* ---- 创建编辑器 ---- */
    let editor = null;
    let running = false;

    async function doRun(code) {
      if (running) return;
      running = true;
      editor.setBusy(true);

      const statusEl = $('.pg-status', outHead);
      statusEl.className = 'pg-status idle';
      statusEl.textContent = '运行中…';
      term.innerHTML = '';
      compilePanel.classList.add('hidden');

      try {
        const d = await api('/api/code/run', {
          code,
          stdin: stdinTa.value || null,
        });

        // 结论
        statusEl.className = 'pg-status ' + (d.ok ? 'pass' : d.status === 'TIMEOUT' ? 'warn' : 'fail');
        statusEl.textContent = d.summary;

        // 编译错误
        if (d.compileError) {
          compilePanel.classList.remove('hidden');
          compileBody.textContent = d.compileError;
        }

        // 输出
        term.innerHTML = '';
        if (d.stdout) {
          term.appendChild(el('div', {}, d.stdout));
        }
        if (d.stderr) {
          term.appendChild(el('div', { class: 'err' }, d.stderr));
        }
        if (!d.stdout && !d.stderr && !d.compileError) {
          term.appendChild(el('div', { class: 'dim' }, '（程序运行结束，没有任何输出）'));
        }
        if (d.truncated) {
          term.appendChild(el('div', { class: 'dim' }, '\n[输出被截断]'));
        }
        term.appendChild(el('div', { class: 'dim', style: 'margin-top:8px' },
          `耗时 ${d.durationMs}ms`));

      } catch (e) {
        if (e.kind === 'abort') return;
        statusEl.className = 'pg-status fail';
        statusEl.textContent = '请求失败';
        term.innerHTML = '';
        term.appendChild(el('div', { class: 'err' }, e.message));
      } finally {
        running = false;
        editor.setBusy(false);
      }
    }

    editor = window.LS.playground.createEditor(editorHost, {
      title: 'Main.java',
      value: DEFAULT_CODE,
      runLabel: '▶ 运行 (Ctrl+Enter)',
      onRun: doRun,
    });

    /* ---- 检测后端 ---- */
    (async () => {
      try {
        await api('/api/code/problems', null, 6000);
        statusBox.className = 'msg ok show';
        statusBox.innerHTML = '';
        statusBox.appendChild(el('span', {}, '✓ 评测服务已连接 —— 可以直接运行代码了'));
      } catch (e) {
        statusBox.className = 'msg err show';
        statusBox.innerHTML = '';
        statusBox.appendChild(el('div', {}, '✗ ' + e.message));
        statusBox.appendChild(el('div', { class: 'small', style: 'margin-top:6px' },
          '启动后端：cd project/bookhub && mvnw.cmd spring-boot:run'));
        statusBox.appendChild(el('div', { class: 'small' },
          '若端口不是 8080，在「内容与设置」里改后端地址'));
      }
    })();

    return page;
  }

  /* ============================================================
   * 视图 2：编程题判题
   * ============================================================ */
  function viewProblem(problemId, navigate) {
    const page = el('div', { class: 'page' });

    /* ---- 头部 ---- */
    page.appendChild(el('div', { class: 'topic-hero' },
      el('div', { class: 'hero-meta' },
        el('span', { class: 'badge brand' }, '📝 编程题'),
        el('span', {}, '自动判分 · 隐藏用例')
      ),
      el('h1', {}, '编程挑战'),
      el('p', { class: 'lede' },
        '写代码 → 提交 → 系统用多组测试用例验证。' +
        '示例用例是给你调试的，隐藏用例才是真正判分依据。')
    ));

    const container = el('div', {});
    page.appendChild(container);

    /* ---- 先加载题目列表 ---- */
    const loading = el('div', { class: 'msg warn show' }, '正在加载题目…');
    page.appendChild(loading);

    (async () => {
      let problems = [];
      try {
        problems = await api('/api/code/problems', null, 8000);
        loading.remove();
      } catch (e) {
        loading.className = 'msg err show';
        loading.innerHTML = '';
        loading.appendChild(el('div', {}, '✗ 无法加载题目：' + e.message));
        loading.appendChild(el('div', { class: 'small', style: 'margin-top:6px' },
          '请确认后端已启动。学习系统的其他功能不受影响。'));
        return;
      }

      /* ---- 题目选择器 ---- */
      const solved = JSON.parse(localStorage.getItem('ls.solved') || '{}');

      const picker = el('div', { class: 'pg-probs' });
      problems.forEach((p) => {
        const isOn = p.id === problemId;
        picker.appendChild(el('button', {
          class: 'pg-prob-card' + (isOn ? ' on' : ''),
          type: 'button',
          onclick: () => navigate('/practice/' + p.id),
        },
          el('div', { class: 'tt' },
            p.title,
            solved[p.id] ? el('span', { class: 'pg-solved', title: '已通过' }, '✓') : null
          ),
          el('div', { class: 'meta' },
            `${p.difficulty} · ${p.caseCount} 个用例`)
        ));
      });
      container.appendChild(picker);

      /* ---- 没有指定题目：显示提示 ---- */
      if (!problemId) {
        container.appendChild(el('div', { class: 'card' },
          el('div', { class: 'empty' },
            el('div', { class: 'e-icon' }, '👆'),
            el('div', { class: 'e-t' }, '选一道题开始'),
            el('div', {}, `共 ${problems.length} 道题，从上面选一道`)
          )
        ));
        return;
      }

      /* ---- 加载题目详情 ---- */
      let problem = null;
      try {
        problem = await api('/api/code/problems/' + encodeURIComponent(problemId), null, 8000);
      } catch (e) {
        container.appendChild(el('div', { class: 'msg err show' }, '加载题目失败：' + e.message));
        return;
      }

      /* ---- 题目描述 ---- */
      const diffClass = { '入门': 'easy', '简单': 'medium', '中等': 'hard' }[problem.difficulty] || 'medium';

      const descCard = el('div', { class: 'pg-problem' });
      descCard.appendChild(el('div', { class: 'pg-problem-head' },
        el('h2', {}, problem.title),
        el('span', { class: 'pg-diff ' + diffClass }, problem.difficulty)
      ));

      const descBody = el('div', { class: 'prose', html: window.LS.md.render(problem.description).html });
      descCard.appendChild(descBody);

      if (problem.methodSignature) {
        descCard.appendChild(el('div', { class: 'small muted', style: 'margin-top:12px;margin-bottom:4px' },
          '需要实现的方法：'));
        descCard.appendChild(el('div', { class: 'pg-sig' }, problem.methodSignature));
      }

      // 示例用例
      if (problem.samples && problem.samples.length) {
        const s = problem.samples[0];
        descCard.appendChild(el('div', {
          style: 'margin-top:12px;padding:10px 12px;background:var(--c-surface-3);border-radius:8px;font-size:13px',
        },
          el('div', { style: 'font-weight:650;margin-bottom:6px' }, '示例'),
          el('div', { class: 'pg-io' },
            el('span', { class: 'k' }, '输入'),
            el('span', { class: 'v' }, s.input || '（无）'),
            el('span', { class: 'k' }, '输出'),
            el('span', { class: 'v exp' }, s.expected)
          )
        ));
      }

      if (problem.hint) {
        descCard.appendChild(el('div', {
          class: 'small',
          style: 'margin-top:12px;padding:8px 12px;border-left:3px solid var(--c-warn);' +
            'background:var(--c-warn-weak);border-radius:0 6px 6px 0;color:var(--c-text-2)',
        }, '💡 ' + problem.hint));
      }
      container.appendChild(descCard);

      /* ---- 编辑器 + 结果 ---- */
      const pg = el('div', { class: 'pg' });
      const editorHost = el('div', {});
      pg.appendChild(editorHost);

      const outCol = el('div', { class: 'pg-out' });

      // 判题结果面板
      const resPanel = el('div', { class: 'pg-panel' });
      const resHead = el('div', { class: 'pg-panel-head' },
        el('span', {}, '判题结果'),
        el('span', { class: 'pg-status idle' }, '未提交')
      );
      const resBody = el('div', {});
      resPanel.appendChild(resHead);
      resPanel.appendChild(resBody);

      outCol.appendChild(resPanel);
      pg.appendChild(outCol);
      container.appendChild(pg);

      /* ---- 编辑器实例 ---- */
      let judging = false;
      const editor = window.LS.playground.createEditor(editorHost, {
        title: 'Main.java',
        value: problem.skeleton || '',
        runLabel: '▶ 提交判题 (Ctrl+Enter)',
        onRun: doJudge,
      });

      async function doJudge(code) {
        if (judging) return;
        judging = true;
        editor.setBusy(true);

        const statusEl = $('.pg-status', resHead);
        statusEl.className = 'pg-status idle';
        statusEl.textContent = '判题中…';
        resBody.innerHTML = '';
        resBody.appendChild(el('div', { style: 'padding:20px' },
          el('span', { class: 'pg-busy' }, '正在编译并运行测试用例…')));

        try {
          const d = await api('/api/code/judge', { problemId, code }, 60000);

          statusEl.className = 'pg-status ' + (d.ok ? 'pass' : 'fail');
          statusEl.textContent = d.ok ? `通过 ${d.passed}/${d.total}` : `通过 ${d.passed}/${d.total}`;

          resBody.innerHTML = '';

          /* --- 编译失败 --- */
          if (d.compileError) {
            resBody.appendChild(el('div', { class: 'pg-compile' }, d.compileError));
            return;
          }

          /* --- 得分环 --- */
          const scoreRow = el('div', { class: 'pg-score' },
            el('div', {
              class: 'pg-ring ' + (d.ok ? 'pass' : 'fail'),
              style: `--p:${d.score}`,
            }, el('span', {}, d.score + '%')),
            el('div', { class: 'pg-score-info' },
              el('div', { class: 't' }, d.ok ? '🎉 全部通过' : '还差一点'),
              el('div', { class: 'd' }, d.summary),
              el('div', { class: 'small muted', style: 'margin-top:4px' },
                `${d.passed}/${d.total} 用例 · 耗时 ${d.durationMs}ms`)
            )
          );
          resBody.appendChild(scoreRow);

          /* --- 用例列表 --- */
          const cases = el('div', { class: 'pg-cases' });
          d.cases.forEach((c, i) => {
            const cls = c.passed ? 'pass'
              : c.status === 'TIMEOUT' ? 'warn' : 'fail';

            const card = el('div', { class: 'pg-case ' + cls + (c.passed ? '' : ' open') });
            const head = el('div', { class: 'pg-case-head' },
              el('span', { style: 'flex:0 0 auto' }, c.passed ? '✓' : (c.status === 'TIMEOUT' ? '⏱' : '✗')),
              el('span', { class: 'name' }, c.name || `用例 ${i + 1}`),
              el('span', { class: 'ms' }, `${c.durationMs}ms`),
              el('span', { style: 'color:var(--c-text-3);font-size:10px' }, '▾')
            );
            head.addEventListener('click', () => card.classList.toggle('open'));

            const body = el('div', { class: 'pg-case-body' });
            if (!c.passed) {
              const io = el('div', { class: 'pg-io' });
              io.appendChild(el('span', { class: 'k' }, '输入'));
              io.appendChild(el('span', { class: 'v' }, c.input || '（无）'));
              io.appendChild(el('span', { class: 'k' }, '期望'));
              io.appendChild(el('span', { class: 'v exp' }, c.expected || '（无）'));
              io.appendChild(el('span', { class: 'k' }, '实际'));
              io.appendChild(el('span', { class: 'v act' }, (c.actual || '').trim() || '（无输出）'));
              body.appendChild(io);
              if (c.message) {
                body.appendChild(el('div', {
                  style: 'margin-top:6px;color:var(--c-danger)',
                }, c.message));
              }
            } else {
              body.appendChild(el('div', { class: 'dim' }, '此用例通过'));
            }

            card.appendChild(head);
            card.appendChild(body);
            cases.appendChild(card);
          });
          resBody.appendChild(cases);

          /* --- 全部通过时记入本地进度 --- */
          if (d.ok) {
            const s = JSON.parse(localStorage.getItem('ls.solved') || '{}');
            s[problemId] = Date.now();
            localStorage.setItem('ls.solved', JSON.stringify(s));
            // 刷新选择器上的 ✓ 标记
            const btn = picker.querySelector('.pg-prob-card.on .tt');
            if (btn && !btn.querySelector('.pg-solved')) {
              btn.appendChild(el('span', { class: 'pg-solved', title: '已通过' }, '✓'));
            }
          }

        } catch (e) {
          if (e.kind === 'abort') return;
          statusEl.className = 'pg-status fail';
          statusEl.textContent = '判题失败';
          resBody.innerHTML = '';
          resBody.appendChild(el('div', { class: 'pg-compile' }, e.message));
        } finally {
          judging = false;
          editor.setBusy(false);
        }
      }
    })();

    return page;
  }

  /* ============================================================
   * 导出
   * ============================================================ */
  window.LS = window.LS || {};
  window.LS.practice = {
    viewPlayground,
    viewProblem,
    apiBase,
    setApiBase(base) {
      localStorage.setItem('ls.apiBase', base);
    },
  };
})();

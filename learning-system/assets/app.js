/* ============================================================
 * app.js —— 学习系统内核（视图 + 路由 + 交互）
 * ------------------------------------------------------------
 * 这个文件只做三件事：
 *   1. 路由：hash 路由，file:// 下也能正常工作（刷新不 404）
 *   2. 渲染：把 LS.content（内容） + LS.store（状态）渲染成界面
 *   3. 事件委托：所有点击用一个监听器处理（性能 + 代码简洁）
 *
 * 它不认识任何具体知识点 —— 换一套内容包，界面自动变。
 * ============================================================ */
(function () {
  'use strict';

  const { md, store, registry } = window.LS;
  const S = store.S;

  /* ============================================================
   * 工具函数
   * ============================================================ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = md.escapeHtml;

  function el(tag, attrs = {}, ...children) {
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
  }

  function toast(msg, ms = 2000) {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = el('div', { class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    const t = el('div', { class: 'toast' }, msg);
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 220);
    }, ms);
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fmtDuration(sec) {
    if (sec < 60) return `${sec}秒`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}分钟`;
    const h = Math.floor(m / 60);
    return `${h}小时${m % 60 ? m % 60 + '分' : ''}`;
  }

  /* ============================================================
   * 路由
   * ============================================================ */
  const routes = [];
  function route(pattern, handler) {
    // 把 "/topic/:pack/:topic" 编译成正则 + 参数名
    const keys = [];
    const re = new RegExp(
      '^' +
        pattern
          .replace(/\/:([a-zA-Z0-9_]+)/g, (_, k) => {
            keys.push(k);
            return '/([^/]+)';
          })
          .replace(/\*/g, '.*') +
        '$'
    );
    routes.push({ re, keys, handler, pattern });
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
    return { path: pathPart || '/', query };
  }

  function navigate(path) {
    if (location.hash === '#' + path) render();
    else location.hash = '#' + path;
  }

  /* ============================================================
   * 侧栏
   * ============================================================ */
  const collapsed = new Set();

  function renderSidebar() {
    const side = $('.sidebar');
    const content = window.LS.content;
    const stats = store.stats();
    const active = parseHash();

    side.innerHTML = '';

    // 顶部导航
    const nav = [
      { icon: '🏠', label: '学习总览', path: '/', badge: '' },
      { icon: '🧪', label: '练习场 · 运行代码', path: '/practice' },
      { icon: '📝', label: '编程挑战 · 判题', path: '/challenges' },
      { icon: '🔁', label: '今日复习', path: '/review', badge: stats.due ? String(stats.due) : '' },
      { icon: '🎯', label: '学习计划', path: '/plan' },
      { icon: '📊', label: '学习记录', path: '/stats' },
    ];
    const navSec = el('div', { class: 'side-sec' });
    nav.forEach((n) => {
      const a = el('a', {
        class: 'topic-link' + (active.path === n.path ? ' active' : ''),
        href: '#' + n.path,
        onclick: (e) => { e.preventDefault(); navigate(n.path); },
      },
        el('span', { style: 'width:16px;text-align:center;flex:0 0 auto' }, n.icon),
        el('span', { style: 'flex:1' }, n.label),
        n.badge ? el('span', { class: 'badge danger' }, n.badge) : null
      );
      navSec.appendChild(a);
    });
    side.appendChild(navSec);

    // 总进度
    const prog = el('div', { class: 'side-sec', style: 'padding:0 8px 8px' });
    prog.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:4px' },
      el('span', { class: 'small muted' }, `总进度 ${stats.mastered}/${stats.total}`),
      el('span', { class: 'small', style: 'color:var(--c-brand);font-weight:600' }, stats.pct + '%')
    ));
    prog.appendChild(el('div', { class: 'progress' }, el('i', { style: `width:${stats.pct}%` })));
    side.appendChild(prog);

    // 内容包分组
    const packsSec = el('div', { class: 'side-sec' });
    const head = el('div', { class: 'side-title' },
      el('span', {}, '学习内容'),
      el('button', {
        type: 'button',
        title: '展开/收起全部',
        onclick: () => {
          const allCollapsed = content.packs.every((p) => collapsed.has(p.id));
          content.packs.forEach((p) => allCollapsed ? collapsed.delete(p.id) : collapsed.add(p.id));
          renderSidebar();
        },
      }, '⇅')
    );
    packsSec.appendChild(head);

    content.packs.forEach((pack) => {
      const isCollapsed = collapsed.has(pack.id);
      const group = el('div', { class: 'pack-group' + (isCollapsed ? ' collapsed' : '') });

      const packTopics = content.topics.filter((t) => t.packId === pack.id);
      const packNodes = packTopics.reduce((s, t) => s + t.nodes.length, 0);
      let packDone = 0;
      packTopics.forEach((t) => t.nodes.forEach((n) => {
        if (store.getNode(`${t.key}/${n.id}`).status === S.MASTERED) packDone++;
      }));

      const phead = el('button', {
        class: 'pack-head',
        type: 'button',
        onclick: () => {
          if (collapsed.has(pack.id)) collapsed.delete(pack.id);
          else collapsed.add(pack.id);
          renderSidebar();
        },
      },
        el('span', { class: 'pack-dot', style: `background:${pack.color || pack.packColor || '#4f7cff'}` }),
        el('span', { class: 'pack-name' }, pack.title),
        el('span', { class: 'topic-prog' }, `${packDone}/${packNodes}`),
        el('span', { class: 'pack-caret' }, '▾')
      );
      group.appendChild(phead);

      const body = el('div', { class: 'pack-body' });
      packTopics.forEach((t) => {
        let done = 0;
        t.nodes.forEach((n) => { if (store.getNode(`${t.key}/${n.id}`).status === S.MASTERED) done++; });
        const pct = Math.round((done / t.nodes.length) * 100);
        const isActive = active.path.startsWith('/topic/') && active.path.includes(t.key);
        const link = el('a', {
          class: 'topic-link' + (isActive ? ' active' : '') + (done === t.nodes.length ? ' done' : ''),
          href: '#/topic/' + t.key,
          onclick: (e) => { e.preventDefault(); navigate('/topic/' + t.key); },
          title: t.title,
        },
          el('span', { class: `ring${done === t.nodes.length ? ' ok' : ''}`, style: `--p:${pct}` }),
          el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.title),
          el('span', { class: 'topic-prog' }, `${done}/${t.nodes.length}`)
        );
        body.appendChild(link);
      });
      group.appendChild(body);
      packsSec.appendChild(group);
    });
    side.appendChild(packsSec);

    // 内容管理入口
    side.appendChild(el('div', { class: 'side-sec', style: 'padding:0 8px' },
      el('a', {
        class: 'topic-link',
        href: '#/manage',
        onclick: (e) => { e.preventDefault(); navigate('/manage'); },
      }, el('span', { style: 'width:16px;text-align:center' }, '⚙️'), el('span', {}, '内容与设置'))
    ));
  }

  /* ============================================================
   * 视图：学习总览（Dashboard）
   * ============================================================ */
  function viewDashboard() {
    const content = window.LS.content;
    const stats = store.stats();
    const log = store.logFor();
    const streak = store.streak();
    const goal = store.state().settings.dailyGoalMin;
    const due = store.dueReviews();

    const page = el('div', { class: 'page' });

    // 问候 + 每日目标
    const hour = new Date().getHours();
    const greet = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
    page.appendChild(el('div', { class: 'dash-greet' },
      el('h1', {}, `${greet}，今天学点什么？`),
      el('p', {}, `连续学习 ${streak} 天 · 今日 ${fmtDuration(log.sec)} / 目标 ${goal} 分钟 · 共 ${content.topics.length} 个主题`)
    ));

    // 统计卡
    page.appendChild(el('div', { class: 'stat-grid' },
      statCard(stats.mastered, '已掌握节点', 'ok'),
      statCard(stats.learning, '学习中', 'brand'),
      statCard(stats.newCount, '未开始', ''),
      statCard(stats.due, '待复习', stats.due ? 'warn' : '')
    ));

    // 今日任务卡
    const taskCard = el('div', { class: 'card mt-4' });
    taskCard.appendChild(el('div', { class: 'row mb-4' },
      el('h3', { style: 'font-size:16px;flex:1' }, '🎯 接下来做什么'),
      el('span', { class: 'badge ' + (log.sec >= goal * 60 ? 'ok' : 'warn') },
        log.sec >= goal * 60 ? '今日目标已达成' : `还差 ${goal - Math.round(log.sec / 60)} 分钟`)
    ));

    const tasks = [];
    if (due.length) {
      tasks.push({
        icon: '🔁',
        title: `复习 ${due.length} 个到期节点`,
        desc: '按艾宾浩斯间隔到期，趁热复习效果最好',
        action: () => navigate('/review'),
        cta: '去复习',
        primary: true,
      });
    }
    // 推荐下一个未开始的节点（按前置依赖满足的优先）
    const next = suggestNext();
    if (next) {
      const n = store.getNode(next.key);
      tasks.push({
        icon: n.status === S.LEARNING ? '▶️' : '📖',
        title: (n.status === S.LEARNING ? '继续：' : '开始：') + next.node.title,
        desc: `${next.topic.title} · ${next.topic.packTitle}`,
        action: () => navigate('/topic/' + next.topic.key + '?node=' + next.node.id),
        cta: n.status === S.LEARNING ? '继续学' : '开始学',
        primary: true,
      });
    }
    // 弱项提醒：最近测验得分低
    Object.entries(store.state().quiz)
      .filter(([, q]) => q.total && q.last / q.total < 0.7)
      .slice(0, 2)
      .forEach(([tk, q]) => {
        const t = window.LS.content.index[tk];
        if (!t) return;
        tasks.push({
          icon: '⚠️',
          title: `重做测验：${t.title}`,
          desc: `上次得分 ${q.last}/${q.total}，建议再练一遍`,
          action: () => navigate('/quiz/' + tk),
          cta: '去测验',
        });
      });

    if (!tasks.length) {
      tasks.push({
        icon: '🎉',
        title: '全部完成！',
        desc: '所有节点都已掌握。可以去做编程挑战，或添加新的学习内容',
        action: () => navigate('/challenges'),
        cta: '做编程题',
      });
    }

    tasks.slice(0, 3).forEach((t) => {
      taskCard.appendChild(el('div', {
        class: 'row',
        style: 'padding:12px;border:1px solid var(--c-border);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .18s',
        onclick: t.action,
        onmouseenter: (e) => { e.currentTarget.style.borderColor = 'var(--c-brand)'; e.currentTarget.style.background = 'var(--c-brand-weak)'; },
        onmouseleave: (e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = ''; },
      },
        el('span', { style: 'font-size:20px;flex:0 0 auto' }, t.icon),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:600;font-size:14px' }, t.title),
          el('div', { class: 'small muted', style: 'margin-top:2px' }, t.desc)
        ),
        el('span', { class: 'btn btn-sm' + (t.primary ? ' btn-primary' : '') }, t.cta)
      ));
    });
    page.appendChild(taskCard);

    // 学习热力图
    page.appendChild(el('div', { class: 'card mt-4' },
      el('div', { class: 'row mb-2' },
        el('h3', { style: 'font-size:16px;flex:1' }, '📅 学习热力图（近 20 周）'),
        el('span', { class: 'small muted' }, '颜色越深 = 当日学习时间越长')
      ),
      renderHeatmap()
    ));

    // 内容包总览
    const packCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:16px;margin-bottom:16px' }, '📚 学习内容包')
    );
    const grid = el('div', { class: 'grid-auto' });
    content.packs.forEach((pack) => {
      const ts = content.topics.filter((t) => t.packId === pack.id);
      let total = 0, mastered = 0, learning = 0;
      ts.forEach((t) => t.nodes.forEach((n) => {
        total++;
        const st = store.getNode(`${t.key}/${n.id}`).status;
        if (st === S.MASTERED) mastered++;
        else if (st === S.LEARNING) learning++;
      }));
      const pct = total ? Math.round(((mastered + learning * .4) / total) * 100) : 0;

      grid.appendChild(el('div', {
        class: 'card hoverable',
        style: 'padding:16px;box-shadow:none;cursor:pointer',
        onclick: () => navigate('/topic/' + ts[0].key),
      },
        el('div', { class: 'row', style: 'margin-bottom:8px' },
          el('span', { class: 'pack-dot', style: `background:${pack.color || '#4f7cff'};width:10px;height:10px` }),
          el('strong', { style: 'flex:1' }, pack.title),
          pack.source === 'imported' ? el('span', { class: 'badge info' }, '导入') : null
        ),
        el('div', { class: 'small muted', style: 'margin-bottom:10px' },
          `${ts.length} 个主题 · ${total} 个节点 · ${pack.version}`),
        el('div', { class: 'progress', style: 'margin-bottom:6px' }, el('i', { style: `width:${pct}%` })),
        el('div', { class: 'row' },
          el('span', { class: 'small muted', style: 'flex:1' }, `${mastered} 掌握 / ${learning} 学习中`),
          el('span', { class: 'small', style: 'font-weight:600;color:var(--c-brand)' }, pct + '%')
        )
      ));
    });
    packCard.appendChild(grid);
    page.appendChild(packCard);

    return page;
  }

  function statCard(value, label, tone) {
    return el('div', { class: 'stat ' + (tone || '') },
      el('div', { class: 's-v' }, String(value)),
      el('div', { class: 's-l' }, label)
    );
  }

  function renderHeatmap() {
    const map = new Map(store.state().log.map((x) => [x.d, x]));
    const wrap = el('div', { class: 'heatmap' });
    const days = 140; // 20 周
    const today = new Date();
    // 对齐到本周日，让每列是一周
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    // 补齐到周日开头
    start.setDate(start.getDate() - start.getDay());

    for (let i = 0; i < days + 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d > today) {
        wrap.appendChild(el('div', { class: 'hm-cell', style: 'opacity:.35' }));
        continue;
      }
      const k = store.todayKey(d);
      const rec = map.get(k) || { sec: 0, n: 0 };
      const min = rec.sec / 60;
      let level = 0;
      if (min >= 60) level = 4;
      else if (min >= 30) level = 3;
      else if (min >= 10) level = 2;
      else if (min > 0 || rec.n > 0) level = 1;
      const isToday = k === store.todayKey();
      wrap.appendChild(el('div', {
        class: 'hm-cell' + (level ? ' l' + level : '') + (isToday ? ' today' : ''),
        title: `${k}${isToday ? ' (今天)' : ''}  ${fmtDuration(rec.sec)}` +
               `${rec.n ? ' / ' + rec.n + ' 个新节点' : ''}`,
      }));
    }
    return wrap;
  }

  function suggestNext() {
    const all = registry.allNodes();
    // 优先：学习中的（继续）→ 前置条件满足的未开始（按包顺序）
    const learning = all.find((x) => store.getNode(x.key).status === S.LEARNING);
    if (learning) return learning;

    for (const x of all) {
      if (store.getNode(x.key).status !== S.NEW) continue;
      const deps = x.topic.prereq || [];
      const ok = deps.every((dep) => {
        const key = dep.includes('/') ? dep : `${x.topic.packId}/${dep}`;
        const t = window.LS.content.index[key];
        if (!t) return true;
        // 前置主题至少有一个节点在学习/掌握
        return t.nodes.some((n) => store.getNode(`${key}/${n.id}`).status !== S.NEW);
      });
      if (ok) return x;
    }
    return all.find((x) => store.getNode(x.key).status === S.NEW) || null;
  }

  /* ============================================================
   * 视图：主题页（核心阅读界面）
   * ============================================================ */
  function viewTopic(packId, topicId, query) {
    const key = `${packId}/${topicId}`;
    const topic = window.LS.content.index[key];
    if (!topic) return viewNotFound(`主题 ${key} 不存在`);

    const page = el('div', { class: 'page' });

    // ---- Hero ----
    let doneCount = 0;
    topic.nodes.forEach((n) => { if (store.getNode(`${key}/${n.id}`).status === S.MASTERED) doneCount++; });
    const pct = Math.round((doneCount / topic.nodes.length) * 100);

    const hero = el('div', { class: 'topic-hero' });
    hero.appendChild(el('div', { class: 'hero-meta' },
      el('span', { class: 'badge brand' }, topic.packTitle),
      el('span', {}, `· ${topic.nodes.length} 个学习点`),
      el('span', {}, `· 已掌握 ${doneCount}/${topic.nodes.length} (${pct}%)`),
      topic.estMin ? el('span', {}, `· 约 ${topic.estMin} 分钟`) : null
    ));
    hero.appendChild(el('h1', {}, topic.title));
    if (topic.summary) hero.appendChild(el('p', { class: 'lede' }, topic.summary));
    if (topic.tags && topic.tags.length) {
      hero.appendChild(el('div', { class: 'hero-tags' },
        topic.tags.map((t) => el('span', { class: 'badge' }, '#' + t))
      ));
    }
    page.appendChild(hero);

    // ---- 学习点列表 ----
    const nodeSec = el('div', { class: 'card', style: 'margin-bottom:20px' });
    nodeSec.appendChild(el('div', { class: 'row mb-2' },
      el('h3', { style: 'font-size:15px;flex:1' }, '学习点清单'),
      el('span', { class: 'small muted' }, '点击标记状态')
    ));
    const list = el('div', { class: 'node-list' });
    topic.nodes.forEach((n, i) => {
      const nk = `${key}/${n.id}`;
      const st = store.getNode(nk);
      const item = el('div', { class: `node-item s${st.status}` },
        el('span', { class: 'badge', style: 'flex:0 0 auto' }, String(i + 1)),
        el('span', { class: 'ni-title' }, n.title),
        n.key ? el('span', { class: 'badge warn' }, '核心') : null,
        el('span', { class: 'ni-meta' }, store.S_LABEL[st.status]),
        el('button', {
          class: 'btn btn-sm' + (st.status === S.MASTERED ? ' btn-ok' : ''),
          type: 'button',
          onclick: (e) => {
            e.stopPropagation();
            const nextSt = st.status === S.MASTERED ? S.LEARNING : st.status === S.LEARNING ? S.MASTERED : S.LEARNING;
            store.setNodeStatus(nk, nextSt);
            toast(`${n.title} → ${store.S_LABEL[nextSt]}`);
            render();
          },
        }, st.status === S.MASTERED ? '已掌握' : st.status === S.LEARNING ? '标记掌握' : '开始学')
      );
      item.addEventListener('click', () => {
        const anchor = document.getElementById('node-' + n.id);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          anchor.classList.add('flash');
          setTimeout(() => anchor.classList.remove('flash'), 1200);
        }
      });
      list.appendChild(item);
    });
    nodeSec.appendChild(list);
    page.appendChild(nodeSec);

    // ---- 正文 ----
    const bodyWrap = el('div', { class: 'with-toc' });
    const article = el('div', { class: 'prose card' });

    /** 渲染结果（toc 用）；无正文时为 null */
    let rendered = null;

    if (!topic.lessonText) {
      article.appendChild(el('div', { class: 'empty' },
        el('div', { class: 'e-icon' }, '📄'),
        el('div', { class: 'e-t' }, '这个主题还没有正文'),
        el('div', {}, '在 content/packs/' + topic.packId + '/ 里给该主题补上 lesson 文件')
      ));
    } else {
      const mdText = topic.lessonText;
      rendered = md.render(mdText);
      article.innerHTML = rendered.html;

      // ---- 底部：笔记 + 复习 ----
      const nk0 = `${key}/${topic.nodes[0].id}`;
      const noteState = store.getNode(nk0);

      const footer = el('div', { style: 'margin-top:32px;padding-top:24px;border-top:1px solid var(--c-border)' });

      // 我的笔记
      footer.appendChild(el('div', { class: 'row mb-2' },
        el('h3', { style: 'font-size:15px;flex:1' }, '📝 我的笔记'),
        el('span', { class: 'small muted' }, '自动保存到本地')
      ));

      const ta = el('textarea', {
        class: 'textarea',
        placeholder: '写下你的理解、疑问、易错点……\n\n费曼技巧：用自己的话把这一节讲一遍，卡住的地方就是没懂的地方。',
        rows: '5',
      });
      ta.value = noteState.note || '';
      let noteTimer;
      ta.addEventListener('input', () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => {
          store.setNodeNote(nk0, ta.value);
        }, 700);
      });
      footer.appendChild(ta);
      article.appendChild(footer);
    }

    bodyWrap.appendChild(article);

    // 右侧目录
    if (topic.lessonText && rendered && rendered.toc && rendered.toc.length > 2) {
      const tocEl = el('aside', { class: 'toc' });
      tocEl.appendChild(el('div', { class: 'toc-t' }, '本页目录'));
      rendered.toc.filter((x) => x.level >= 2).forEach((x) => {
        const a = el('a', { href: '#' + x.id, class: 'lv' + x.level }, x.text);
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const target = document.getElementById(x.id);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        tocEl.appendChild(a);
      });
      bodyWrap.appendChild(tocEl);
      // 滚动高亮
      setTimeout(() => setupScrollSpy(tocEl), 60);
    }

    page.appendChild(bodyWrap);

    // ---- 操作条（主题级）----
    const actions = el('div', { class: 'status-bar', style: 'margin-top:24px' },
      el('span', { class: 'sb-label' }, '整体状态：'),
      el('button', {
        class: 'btn btn-sm',
        type: 'button',
        onclick: () => {
          topic.nodes.forEach((n) => store.setNodeStatus(`${key}/${n.id}`, S.LEARNING));
          toast('已标记：全部学习中');
          render();
        },
      }, '全部标记学习中'),
      el('button', {
        class: 'btn btn-sm btn-ok',
        type: 'button',
        onclick: () => {
          topic.nodes.forEach((n) => store.setNodeStatus(`${key}/${n.id}`, S.MASTERED));
          toast('已标记：全部已掌握 🎉');
          render();
        },
      }, '全部标记已掌握'),
      el('span', { class: 'spacer' }),
      topic.quizData ? el('button', {
        class: 'btn btn-sm btn-primary',
        type: 'button',
        onclick: () => navigate('/quiz/' + key),
      }, '📝 做测验') : null
    );
    page.appendChild(actions);

    // ---- 前置 / 后续 ----
    const rel = el('div', { class: 'grid-auto', style: 'margin-top:20px' });
    if (topic.prereq && topic.prereq.length) {
      const pre = topic.prereq.map((dep) => {
        const k = dep.includes('/') ? dep : `${topic.packId}/${dep}`;
        const t = window.LS.content.index[k];
        return t ? el('a', { class: 'btn btn-sm', href: '#/topic/' + k },
          '⬅ ' + t.title,
          el('span', { class: 'badge ' + (t.nodes.every((n) => store.getNode(`${k}/${n.id}`).status !== S.NEW) ? 'ok' : 'warn') },
            t.nodes.every((n) => store.getNode(`${k}/${n.id}`).status !== S.NEW) ? '已学' : '未学')
        ) : null;
      }).filter(Boolean);
      if (pre.length) {
        rel.appendChild(el('div', { class: 'card', style: 'padding:14px' },
          el('div', { class: 'small muted', style: 'margin-bottom:8px' }, '前置知识'),
          el('div', { class: 'row-wrap' }, pre)
        ));
      }
    }
    // 后续
    const nexts = window.LS.content.topics.filter((t) => (t.prereq || []).some((d) => {
      const k = d.includes('/') ? d : `${t.packId}/${d}`;
      return k === key;
    }));
    if (nexts.length) {
      rel.appendChild(el('div', { class: 'card', style: 'padding:14px' },
        el('div', { class: 'small muted', style: 'margin-bottom:8px' }, '学完可以继续'),
        el('div', { class: 'row-wrap' }, nexts.slice(0, 6).map((t) =>
          el('a', { class: 'btn btn-sm', href: '#/topic/' + t.key }, t.title + ' ➡')
        ))
      ));
    }
    if (rel.children.length) page.appendChild(rel);

    return page;
  }

  function setupScrollSpy(tocEl) {
    const links = $$('a', tocEl);
    if (!links.length) return;
    const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if (!targets.length) return;
    const onScroll = () => {
      let cur = targets[0];
      for (const t of targets) {
        if (t.getBoundingClientRect().top < 120) cur = t;
      }
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur.id));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
   * 视图：测验
   * ============================================================ */
  function viewQuiz(packId, topicId) {
    const key = `${packId}/${topicId}`;
    const topic = window.LS.content.index[key];
    if (!topic) return viewNotFound('主题不存在');
    if (!topic.quizData) return viewNotFound('该主题还没有测验题');

    const raw = topic.quizData;
    const questions = Array.isArray(raw) ? raw : raw.questions;
    const page = el('div', { class: 'page quiz-shell' });

    page.appendChild(el('div', { class: 'topic-hero' },
      el('div', { class: 'hero-meta' },
        el('span', { class: 'badge brand' }, topic.packTitle),
        el('span', {}, `${questions.length} 题`)
      ),
      el('h1', {}, '📝 ' + topic.title + ' · 测验'),
      el('p', { class: 'lede' }, '做完后立即判分，答错的题会给出解析。得分记录在本地。')
    ));

    const prev = store.quizHistory(key);
    if (prev) {
      page.appendChild(el('div', { class: 'msg warn' },
        `上次成绩：${prev.last}/${prev.total}（最佳 ${prev.best}/${prev.total}，已做 ${prev.attempts} 次）`));
    }

    const container = el('div', {});
    const answers = new Array(questions.length).fill(null);

    questions.forEach((q, qi) => {
      const type = q.type || 'single';
      const card = el('div', { class: 'q-card' });
      card.appendChild(el('div', { class: 'q-head' },
        el('span', { class: 'q-num' }, String(qi + 1)),
        el('span', { class: 'badge' }, { single: '单选', multi: '多选', judge: '判断', fill: '填空' }[type]),
        q.tag ? el('span', { class: 'badge info' }, q.tag) : null
      ));
      card.appendChild(el('div', { class: 'q-text', html: md.render(q.q).html.replace(/^<p>|<\/p>\s*$/g, '') }));

      if (type === 'fill') {
        const input = el('input', {
          class: 'input',
          type: 'text',
          placeholder: '输入答案',
          oninput: (e) => { answers[qi] = e.target.value; },
        });
        card.appendChild(input);
      } else if (type === 'judge') {
        [['true', '正确'], ['false', '错误']].forEach(([val, label]) => {
          const opt = el('label', { class: 'opt' },
            el('input', { type: 'radio', name: 'q' + qi, value: val, onchange: () => {
              answers[qi] = val === 'true';
              $$('.opt', card).forEach((o) => o.classList.remove('on'));
              opt.classList.add('on');
            } }),
            el('span', {}, label)
          );
          card.appendChild(opt);
        });
      } else {
        const multi = type === 'multi';
        q.options.forEach((optText, oi) => {
          const opt = el('label', { class: 'opt' },
            el('input', {
              type: multi ? 'checkbox' : 'radio',
              name: 'q' + qi,
              value: String(oi),
              onchange: () => {
                if (multi) {
                  const cur = new Set(answers[qi] || []);
                  if (opt.querySelector('input').checked) cur.add(oi);
                  else cur.delete(oi);
                  answers[qi] = [...cur].sort((a, b) => a - b);
                  opt.classList.toggle('on', opt.querySelector('input').checked);
                } else {
                  answers[qi] = [oi];
                  $$('.opt', card).forEach((o) => o.classList.remove('on'));
                  opt.classList.add('on');
                }
              },
            }),
            el('span', { style: 'flex:1', html: md.render(optText).html.replace(/^<p>|<\/p>\s*$/g, '') })
          );
          card.appendChild(opt);
        });
      }
      container.appendChild(card);
    });

    page.appendChild(container);

    let submitted = false;
    const submitBtn = el('button', { class: 'btn btn-primary', type: 'button', style: 'width:100%;height:42px;font-size:15px' }, '提交并查看结果');
    page.appendChild(el('div', { class: 'mt-4' }, submitBtn));

    const resultWrap = el('div', {});
    page.appendChild(resultWrap);

    submitBtn.addEventListener('click', () => {
      if (submitted) { render(); return; }
      submitted = true;
      let score = 0;
      const wrong = [];

      questions.forEach((q, qi) => {
        const type = q.type || 'single';
        const card = container.children[qi];
        let ok = false;

        if (type === 'fill') {
          const userAns = String(answers[qi] || '').trim().toLowerCase().replace(/\s+/g, '');
          const accept = [].concat(q.answer).map((a) => String(a).trim().toLowerCase().replace(/\s+/g, ''));
          ok = accept.some((a) => a === userAns);
          const inp = card.querySelector('input');
          inp.disabled = true;
          inp.style.borderColor = ok ? 'var(--c-ok)' : 'var(--c-danger)';
        } else if (type === 'judge') {
          const userAns = answers[qi];
          ok = userAns === q.answer;
          $$('.opt', card).forEach((o) => {
            const inp = o.querySelector('input');
            inp.disabled = true;
            o.classList.add('locked');
            const v = inp.value === 'true';
            if (v === q.answer) o.classList.add('correct');
            else if (v === userAns) o.classList.add('wrong');
          });
        } else {
          const userAns = (answers[qi] || []).map(Number).sort((a, b) => a - b);
          const correct = q.answer.map(Number).sort((a, b) => a - b);
          ok = userAns.length === correct.length && userAns.every((v, i) => v === correct[i]);
          $$('.opt', card).forEach((o, oi) => {
            const inp = o.querySelector('input');
            inp.disabled = true;
            o.classList.add('locked');
            if (correct.includes(oi)) o.classList.add('correct');
            else if (userAns.includes(oi)) o.classList.add('wrong');
          });
        }

        if (ok) score++;
        else wrong.push(qi);

        if (q.explain) {
          card.appendChild(el('div', { class: 'q-explain ' + (ok ? 'ok' : 'no') },
            el('strong', {}, ok ? '✓ 正确　' : '✗ 错误　'),
            el('span', { html: md.render(q.explain).html.replace(/^<p>|<\/p>\s*$/g, '') })
          ));
        }
      });

      const pct = Math.round((score / questions.length) * 100);
      store.recordQuiz(key, score, questions.length, wrong);

      resultWrap.innerHTML = '';
      const res = el('div', { class: 'quiz-result card' });
      const ring = el('div', { class: 'score-ring', style: `--p:${pct}` }, el('span', {}, pct + '%'));
      if (pct >= 80) ring.style.background = `conic-gradient(var(--c-ok) ${pct}%, var(--c-surface-3) 0)`;
      else if (pct < 60) ring.style.background = `conic-gradient(var(--c-danger) ${pct}%, var(--c-surface-3) 0)`;
      res.appendChild(ring);
      res.appendChild(el('h2', { style: 'font-size:20px;margin-bottom:8px' },
        `${score} / ${questions.length}`));
      res.appendChild(el('p', { class: 'muted', style: 'margin-bottom:16px' },
        pct >= 80 ? '掌握得不错！可以标记为已掌握。'
          : pct >= 60 ? '基本OK，把错题解析看一遍再战。'
            : '建议回到正文重读相关章节。'));

      res.appendChild(el('div', { class: 'row', style: 'justify-content:center;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn', type: 'button', onclick: () => render() }, '重做本卷'),
        wrong.length ? el('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            // 只重做错题：把错题索引存到 query，简化实现为提示
            toast('请点"重做本卷"，重点看第 ' + wrong.map((i) => i + 1).join('、') + ' 题');
          },
        }, `只看错题解析`) : null,
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: () => navigate('/topic/' + key),
        }, '回到正文'),
        pct >= 80 ? el('button', {
          class: 'btn btn-ok', type: 'button',
          onclick: () => {
            topic.nodes.forEach((n) => store.setNodeStatus(`${key}/${n.id}`, S.MASTERED));
            toast('全部节点已标记为掌握 🎉');
          },
        }, '标记全部掌握') : null
      ));
      resultWrap.appendChild(res);
      res.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.textContent = '关闭并返回';
    });

    return page;
  }

  /* ============================================================
   * 视图：今日复习
   * ============================================================ */
  function viewReview() {
    const due = store.dueReviews();
    const page = el('div', { class: 'page' });

    page.appendChild(el('div', { class: 'topic-hero' },
      el('h1', {}, '🔁 今日复习'),
      el('p', { class: 'lede' },
        '按艾宾浩斯遗忘曲线调度：学完后 1 / 2 / 4 / 7 / 15 / 30 天各复习一次。' +
        '记住就升一级，忘记就回到起点。')
    ));

    if (!due.length) {
      page.appendChild(el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'e-icon' }, '✅'),
          el('div', { class: 'e-t' }, '今天没有到期的复习'),
          el('div', {}, '按艾宾浩斯曲线，现在确实不用复习。去学点新内容吧'),
          el('div', { class: 'empty-action' },
            el('button', {
              class: 'btn btn-primary', type: 'button',
              onclick: () => navigate('/'),
            }, '📖 找点新内容'),
            el('button', {
              class: 'btn', type: 'button',
              onclick: () => navigate('/practice'),
            }, '🧪 写代码练手')
          )
        )
      ));
    } else {
      page.appendChild(el('div', { class: 'msg warn' }, `有 ${due.length} 个节点到期，现在复习效果最好。`));
      const listCard = el('div', { class: 'card' });
      due.forEach((item) => {
        const [topicKey, nodeId] = splitNodeKey(item.key);
        const topic = window.LS.content.index[topicKey];
        if (!topic) return;
        const node = topic.nodes.find((n) => n.id === nodeId) || { title: nodeId };
        const stage = item.rv?.stage || 1;
        listCard.appendChild(el('div', {
          class: 'row',
          style: 'padding:12px;border:1px solid var(--c-border);border-radius:10px;margin-bottom:8px;flex-wrap:wrap',
        },
          el('div', { style: 'flex:1;min-width:180px' },
            el('div', { style: 'font-weight:600;font-size:14px' }, node.title),
            el('div', { class: 'small muted' }, `${topic.title} · 第 ${stage} 阶复习` +
              (item.rv?.lapses ? ` · 曾遗忘 ${item.rv.lapses} 次` : ''))
          ),
          el('div', { class: 'row', style: 'gap:6px' },
            el('button', {
              class: 'btn btn-sm btn-ok', type: 'button',
              onclick: () => { store.advanceReview(item.key); toast('记住了，下次复习推后 ✓'); render(); },
            }, '👍 记住了'),
            el('button', {
              class: 'btn btn-sm', type: 'button',
              onclick: () => { store.resetReview(item.key); toast('已重置，明天再复习'); render(); },
            }, '😵 忘了'),
            el('a', { class: 'btn btn-sm btn-ghost', href: '#/topic/' + topicKey }, '看正文')
          )
        ));
      });
      page.appendChild(listCard);
    }

    // 即将到期
    const soon = Object.entries(store.state().nodes)
      .filter(([, n]) => n.rv && n.status !== S.NEW && n.rv.nextAt > Date.now())
      .sort((a, b) => a[1].rv.nextAt - b[1].rv.nextAt)
      .slice(0, 8);

    if (soon.length) {
      const c = el('div', { class: 'card mt-4' },
        el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '⏰ 即将到期'));
      soon.forEach(([k, n]) => {
        const [tk, nid] = splitNodeKey(k);
        const t = window.LS.content.index[tk];
        if (!t) return;
        const node = t.nodes.find((x) => x.id === nid) || { title: nid };
        const d = Math.ceil((n.rv.nextAt - Date.now()) / 86400000);
        c.appendChild(el('div', { class: 'row', style: 'padding:6px 0;font-size:13px' },
          el('span', { style: 'flex:1' }, node.title),
          el('span', { class: 'badge' }, d <= 1 ? '明天' : `${d} 天后`)
        ));
      });
      page.appendChild(c);
    }

    return page;
  }

  function splitNodeKey(key) {
    const i = key.lastIndexOf('/');
    return [key.slice(0, i), key.slice(i + 1)];
  }

  /* ============================================================
   * 视图：学习计划
   * ============================================================ */
  function viewPlan() {
    const page = el('div', { class: 'page' });
    page.appendChild(el('div', { class: 'topic-hero' },
      el('h1', {}, '🎯 学习计划'),
      el('p', { class: 'lede' }, '把大目标拆成可执行的小任务。加一条计划，勾掉一条，进度就来了。')
    ));

    // 添加表单
    const form = el('div', { class: 'card' });
    const titleInput = el('input', { class: 'input', type: 'text', placeholder: '例如：学完 MyBatis 动态 SQL 并做完课后练习' });
    const topicSelect = el('select', { class: 'select' },
      el('option', { value: '' }, '— 关联主题（可选）—'),
      window.LS.content.topics.map((t) => el('option', { value: t.key }, `${t.packTitle} / ${t.title}`))
    );
    const dueInput = el('input', { class: 'input', type: 'date' });

    form.appendChild(el('div', { class: 'field' }, el('label', {}, '任务内容'), titleInput));
    form.appendChild(el('div', { class: 'row', style: 'gap:12px;flex-wrap:wrap' },
      el('div', { class: 'field', style: 'flex:2;min-width:200px;margin:0' }, el('label', {}, '关联主题'), topicSelect),
      el('div', { class: 'field', style: 'flex:1;min-width:140px;margin:0' }, el('label', {}, '截止日期'), dueInput)
    ));
    form.appendChild(el('div', { class: 'mt-4' },
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => {
          const title = titleInput.value.trim();
          if (!title) return toast('请填写任务内容');
          store.addPlan(title, topicSelect.value || null, dueInput.value || null);
          toast('已添加');
          render();
        },
      }, '+ 添加任务')
    ));
    page.appendChild(form);

    // 计划列表
    const plans = store.state().plan;
    if (!plans.length) {
      page.appendChild(el('div', { class: 'card mt-4' },
        el('div', { class: 'empty' },
          el('div', { class: 'e-icon' }, '📋'),
          el('div', { class: 'e-t' }, '还没有计划'),
          el('div', {}, '把大目标拆成能勾掉的小任务，进度才可见'),
          el('div', { class: 'empty-action' },
            el('button', {
              class: 'btn btn-primary', type: 'button',
              onclick: () => {
                store.addPlan('读完 CSS 盒模型与优先级，做 3 道测验', 'web-frontend/css', null);
                store.addPlan('实现二分查找并通过判题', 'data-access/mysql-sql', null);
                store.addPlan('跑通 BookHub 的借书接口', 'java-engineering/springboot', null);
                toast('已添加 3 个示例任务');
                render();
              },
            }, '✨ 一键添加示例任务'),
            el('button', {
              class: 'btn', type: 'button',
              onclick: () => navigate('/'),
            }, '先去看看内容')
          )
        )
      ));
    } else {
      const listCard = el('div', { class: 'card mt-4' },
        el('div', { class: 'row mb-4' },
          el('h3', { style: 'font-size:15px;flex:1' }, `任务清单（${plans.filter((p) => !p.done).length} 待完成）`)
        )
      );
      const sorted = [...plans].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return b.at - a.at;
      });
      sorted.forEach((p) => {
        const overdue = p.due && !p.done && p.due < store.todayKey();
        listCard.appendChild(el('div', {
          class: 'row',
          style: 'padding:10px 12px;border:1px solid var(--c-border);border-radius:8px;margin-bottom:6px;' +
            (p.done ? 'opacity:.55' : ''),
        },
          el('input', {
            type: 'checkbox', checked: p.done,
            style: 'width:16px;height:16px;accent-color:var(--c-ok);cursor:pointer',
            onchange: () => { store.togglePlan(p.id); render(); },
          }),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-size:14px;' + (p.done ? 'text-decoration:line-through' : 'font-weight:550') }, p.title),
            el('div', { class: 'row', style: 'gap:6px;margin-top:2px' },
              p.topicKey ? el('span', { class: 'badge brand' },
                (window.LS.content.index[p.topicKey]?.title || p.topicKey)) : null,
              p.due ? el('span', { class: 'badge ' + (overdue ? 'danger' : '') },
                overdue ? '已逾期 ' + p.due : p.due) : null
            )
          ),
          p.topicKey ? el('a', { class: 'btn btn-sm btn-ghost', href: '#/topic/' + p.topicKey }, '去学') : null,
          el('button', {
            class: 'btn btn-sm btn-ghost', type: 'button',
            onclick: () => { store.removePlan(p.id); render(); },
          }, '✕')
        ));
      });
      page.appendChild(listCard);
    }

    return page;
  }

  /* ============================================================
   * 视图：学习记录 / 统计
   * ============================================================ */
  function viewStats() {
    const page = el('div', { class: 'page' });
    const stats = store.stats();
    const state = store.state();

    page.appendChild(el('div', { class: 'topic-hero' },
      el('h1', {}, '📊 学习记录'),
      el('p', { class: 'lede' }, '数据能告诉你：哪里投入了、哪里假努力、下一步该补哪里。')
    ));

    page.appendChild(el('div', { class: 'stat-grid' },
      statCard(stats.total, '总节点', ''),
      statCard(stats.mastered, '已掌握', 'ok'),
      statCard(stats.learning, '学习中', 'brand'),
      statCard(stats.notes, '写了笔记', ''),
      statCard(store.streak() + ' 天', '连续学习', 'warn'),
      statCard(state.plan.filter((p) => !p.done).length, '待办任务', '')
    ));

    // 每个主题的掌握度
    const topicCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:16px' }, '各主题掌握度')
    );
    window.LS.content.packs.forEach((pack) => {
      const ts = window.LS.content.topics.filter((t) => t.packId === pack.id);
      topicCard.appendChild(el('div', { class: 'small', style: 'font-weight:700;color:var(--c-text-3);margin:14px 0 6px' }, pack.title));
      ts.forEach((t) => {
        let m = 0, l = 0;
        t.nodes.forEach((n) => {
          const st = store.getNode(`${t.key}/${n.id}`).status;
          if (st === S.MASTERED) m++;
          else if (st === S.LEARNING) l++;
        });
        const pct = Math.round(((m + l * .4) / t.nodes.length) * 100);
        const q = store.quizHistory(t.key);
        topicCard.appendChild(el('div', { style: 'margin-bottom:10px' },
          el('div', { class: 'row', style: 'margin-bottom:3px' },
            el('a', { href: '#/topic/' + t.key, style: 'flex:1;font-size:13px;color:var(--c-text)' }, t.title),
            q ? el('span', { class: 'badge ' + (q.best / q.total >= .8 ? 'ok' : q.best / q.total >= .6 ? 'warn' : 'danger') },
              `测 ${q.best}/${q.total}`) : null,
            el('span', { class: 'small muted', style: 'width:56px;text-align:right' }, `${m}/${t.nodes.length}`)
          ),
          el('div', { class: 'progress', style: 'height:5px' }, el('i', { style: `width:${pct}%` }))
        ));
      });
    });
    page.appendChild(topicCard);

    // 学习日志表格
    const logCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '最近 14 天')
    );
    const recent = [...state.log].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 14);
    if (!recent.length) {
      logCard.appendChild(el('p', { class: 'muted small' }, '还没有记录，开始学习就会自动记录。'));
    } else {
      const tbl = el('table', { style: 'width:100%;font-size:13px;border-collapse:collapse' });
      tbl.appendChild(el('thead', {}, el('tr', {},
        el('th', { style: 'text-align:left;padding:6px;border-bottom:1px solid var(--c-border)' }, '日期'),
        el('th', { style: 'text-align:right;padding:6px;border-bottom:1px solid var(--c-border)' }, '时长'),
        el('th', { style: 'text-align:right;padding:6px;border-bottom:1px solid var(--c-border)' }, '新节点')
      )));
      const tb = el('tbody');
      recent.forEach((r) => {
        tb.appendChild(el('tr', {},
          el('td', { style: 'padding:6px;border-bottom:1px solid var(--c-border)' }, r.d),
          el('td', { style: 'padding:6px;text-align:right;border-bottom:1px solid var(--c-border)' }, fmtDuration(r.sec)),
          el('td', { style: 'padding:6px;text-align:right;border-bottom:1px solid var(--c-border)' }, String(r.n))
        ));
      });
      tbl.appendChild(tb);
      logCard.appendChild(tbl);
    }
    page.appendChild(logCard);

    // 数据管理
    page.appendChild(el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '数据管理'),
      el('div', { class: 'row-wrap' },
        el('button', { class: 'btn', type: 'button', onclick: exportProgress }, '⬇️ 导出学习进度'),
        el('button', { class: 'btn', type: 'button', onclick: importProgress }, '⬆️ 导入学习进度'),
        el('button', {
          class: 'btn', type: 'button', style: 'color:var(--c-danger);border-color:var(--c-danger)',
          onclick: () => {
            if (confirm('确定清空所有学习进度？此操作不可撤销（内容不会删除）。\n建议先导出备份。')) {
              store.resetAll();
              toast('已清空进度');
              render();
            }
          },
        }, '🗑️ 清空进度')
      ),
      el('p', { class: 'small muted mt-3' }, '进度存在浏览器 localStorage 里。换浏览器/清缓存会丢，重要进度请导出备份。')
    ));

    return page;
  }

  /* ============================================================
   * 视图：内容管理（导入 / 导出 / 新建规范）
   * ============================================================ */
  function viewManage() {
    const page = el('div', { class: 'page' });

    page.appendChild(el('div', { class: 'topic-hero' },
      el('h1', {}, '⚙️ 内容与设置'),
      el('p', { class: 'lede' }, '导入新的学习内容包、查看内置内容、调整外观。')
    ));

    // 已加载的包
    const packCard = el('div', { class: 'card' },
      el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '📦 已加载的内容包')
    );
    window.LS.content.packs.forEach((pack) => {
      const ts = window.LS.content.topics.filter((t) => t.packId === pack.id);
      packCard.appendChild(el('div', {
        class: 'row',
        style: 'padding:10px 12px;border:1px solid var(--c-border);border-radius:8px;margin-bottom:6px',
      },
        el('span', { class: 'pack-dot', style: `background:${pack.color || '#4f7cff'}` }),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { class: 'row', style: 'gap:6px' },
            el('strong', { style: 'font-size:14px' }, pack.title),
            el('span', { class: 'badge ' + (pack.source === 'imported' ? 'info' : '') }, pack.source === 'imported' ? '导入' : '内置'),
            el('span', { class: 'badge' }, pack.version)
          ),
          el('div', { class: 'small muted' }, `${ts.length} 主题 · ${pack.id}`)
        ),
        pack.source === 'imported' ? el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button', style: 'color:var(--c-danger)',
          onclick: () => {
            if (!confirm(`删除内容包「${pack.title}」？\n（学习进度不会丢，重新导入后仍在）`)) return;
            registry.removePack(pack.id);
            toast('已删除，刷新中…');
            setTimeout(() => location.reload(), 500);
          },
        }, '删除') : null
      ));
    });
    page.appendChild(packCard);

    // 导入
    const importCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:6px' }, '⬆️ 导入内容包'),
      el('p', { class: 'small muted', style: 'margin-bottom:12px' },
        '粘贴 JSON，或选择 .json 文件。导入前会校验结构，不合格会明确指出哪里错。')
    );

    const textarea = el('textarea', {
      class: 'code-area',
      placeholder: '{\n  "id": "my-topic",\n  "title": "我的新学习包",\n  "version": "1.0.0",\n  "topics": [ ... ]\n}',
    });
    importCard.appendChild(textarea);

    const fileInput = el('input', {
      type: 'file', accept: '.json,application/json',
      style: 'display:none',
      onchange: (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { textarea.value = String(r.result); previewImport(); };
        r.readAsText(f, 'utf-8');
      },
    });
    importCard.appendChild(fileInput);

    const msgBox = el('div', {});
    importCard.appendChild(msgBox);

    function previewImport() {
      const res = registry.preview(textarea.value);
      msgBox.innerHTML = '';
      if (!textarea.value.trim()) return;
      if (!res.ok) {
        msgBox.appendChild(el('div', { class: 'msg err' }, '校验未通过：\n· ' + res.errors.join('\n· ')));
        return;
      }
      msgBox.appendChild(el('div', { class: 'msg ok' },
        `✓ 校验通过：${res.info.title} v${res.info.version} · ${res.info.topics} 主题 · ${res.info.nodes} 节点`));
    }

    importCard.appendChild(el('div', { class: 'row-wrap mt-3' },
      el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, '📁 选择文件'),
      el('button', { class: 'btn', type: 'button', onclick: previewImport }, '🔍 校验'),
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => {
          try {
            const res = registry.importPack(textarea.value);
            toast(`已导入 ${res.topics} 个主题，刷新中…`);
            setTimeout(() => location.reload(), 600);
          } catch (e) {
            msgBox.innerHTML = '';
            msgBox.appendChild(el('div', { class: 'msg err' }, String(e.message)));
          }
        },
      }, '⬆️ 导入'),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: downloadPackTemplate }, '📄 下载空白模板')
    ));

    page.appendChild(importCard);

    // 规范说明
    const specCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '📐 内容包规范'),
      el('div', { class: 'prose', html: md.render(SPEC_DOC).html })
    );
    page.appendChild(specCard);

    // 设置
    const settings = store.state().settings;
    const setCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:16px' }, '🎨 外观与偏好'),

      el('div', { class: 'field' },
        el('label', {}, '主题'),
        el('div', { class: 'segmented' },
          ['auto', 'light', 'dark'].map((t) =>
            el('button', {
              class: settings.theme === t ? 'on' : '', type: 'button',
              onclick: () => { store.setSetting('theme', t); applyTheme(); render(); },
            }, { auto: '跟随系统', light: '浅色', dark: '深色' }[t])
          )
        )
      ),

      el('div', { class: 'field' },
        el('label', {}, `正文字号：${Math.round(settings.fontScale * 100)}%`),
        el('input', {
          type: 'range', min: '0.85', max: '1.4', step: '0.05', value: String(settings.fontScale),
          style: 'width:100%;accent-color:var(--c-brand)',
          oninput: (e) => { store.setSetting('fontScale', Number(e.target.value)); applyFontScale(); },
          onchange: () => render(),
        })
      ),

      el('div', { class: 'field' },
        el('label', {}, `每日学习目标：${settings.dailyGoalMin} 分钟`),
        el('input', {
          type: 'range', min: '10', max: '180', step: '10', value: String(settings.dailyGoalMin),
          style: 'width:100%;accent-color:var(--c-brand)',
          oninput: (e) => { store.setSetting('dailyGoalMin', Number(e.target.value)); },
          onchange: () => render(),
        })
      ),

      el('label', { class: 'row', style: 'cursor:pointer;font-size:13px' },
        el('input', {
          type: 'checkbox', checked: settings.codeWrap,
          style: 'accent-color:var(--c-brand)',
          onchange: (e) => { store.setSetting('codeWrap', e.target.checked); toast('代码换行：' + (e.target.checked ? '开' : '关')); render(); },
        }),
        el('span', {}, '长代码自动换行（不用横向滚动）')
      )
    );
    page.appendChild(setCard);

    // 评测服务地址（练习场与判题要用）
    const apiBaseVal = localStorage.getItem('ls.apiBase') || 'http://127.0.0.1:8080';
    const apiInput = el('input', {
      class: 'input', type: 'text', value: apiBaseVal,
      placeholder: 'http://127.0.0.1:8080',
      style: 'font-family:var(--f-mono);font-size:13px',
    });

    const apiMsg = el('span', { class: 'small', style: 'margin-left:8px' });

    const apiCard = el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:6px' }, '🔌 评测服务地址'),
      el('p', { class: 'small muted', style: 'margin-bottom:12px' },
        '练习场运行代码、编程题判分都依赖后端。默认 8080 端口。' +
        '若你改过 server.port，在这里同步修改。'),
      el('div', { class: 'row' },
        apiInput,
        el('button', {
          class: 'btn', type: 'button',
          onclick: async () => {
            const v = apiInput.value.trim().replace(/\/$/, '');
            if (!/^https?:\/\//.test(v)) {
              apiMsg.textContent = '✗ 需要以 http:// 开头';
              apiMsg.style.color = 'var(--c-danger)';
              return;
            }
            localStorage.setItem('ls.apiBase', v);
            apiMsg.textContent = '已保存，正在测试连接…';
            apiMsg.style.color = 'var(--c-text-3)';
            try {
              const r = await fetch(v + '/api/code/problems', { signal: AbortSignal.timeout(6000) });
              const j = await r.json();
              if (j.code === 0) {
                apiMsg.textContent = '✓ 连接成功，共 ' + j.data.length + ' 道题';
                apiMsg.style.color = 'var(--c-ok)';
              } else {
                apiMsg.textContent = '✗ 服务返回异常：' + j.message;
                apiMsg.style.color = 'var(--c-danger)';
              }
            } catch (e) {
              apiMsg.textContent = '✗ 连接失败：' + (e.name === 'TimeoutError' ? '超时' : '无法访问');
              apiMsg.style.color = 'var(--c-danger)';
            }
          },
        }, '保存并测试')
      ),
      apiMsg
    );
    page.appendChild(apiCard);

    // 键盘快捷键说明
    page.appendChild(el('div', { class: 'card mt-4' },
      el('h3', { style: 'font-size:15px;margin-bottom:12px' }, '⌨️ 快捷键'),
      el('div', { class: 'prose', html: md.render(
        '| 键 | 功能 |\n|---|---|\n' +
        '| `/` 或 `Ctrl+K` | 聚焦搜索 |\n' +
        '| `Esc` | 关闭搜索/弹窗 |\n' +
        '| `↑` `↓` | 搜索结果中上下移动 |\n' +
        '| `Enter` | 打开选中结果 |\n' +
        '| `g` 然后 `h` | 回首页 |\n' +
        '| `g` 然后 `r` | 今日复习 |\n' +
        '| `?` | 显示这页 |'
      ).html })
    ));

    return page;
  }

  const SPEC_DOC = `
最小可用的内容包，只要 4 个必填字段：

\`\`\`json
{
  "id": "my-topic",
  "title": "我的学习包",
  "version": "1.0.0",
  "topics": [
    {
      "id": "intro",
      "title": "第一课",
      "summary": "一句话说明这课讲什么",
      "tags": ["基础"],
      "estMin": 20,
      "lesson": "# 第一课\\n\\n正文用 Markdown 写……",
      "nodes": [{ "id": "n1", "title": "知识点一", "key": true }]
    }
  ]
}
\`\`\`

::: key 字段说明
| 字段 | 必填 | 说明 |
|---|---|---|
| \`id\` | ✓ | 小写字母/数字/连字符，全局唯一 |
| \`title\` | ✓ | 显示名 |
| \`version\` | ✓ | 语义化版本，用于识别更新 |
| \`topics\` | ✓ | 主题数组，至少 1 个 |
| \`topics[].id\` | ✓ | 包内唯一 |
| \`topics[].title\` | ✓ | 主题名 |
| \`topics[].lesson\` |  | Markdown 正文全文（也可用构建脚本读文件） |
| \`topics[].nodes\` |  | 学习点，省略则整课算一个节点 |
| \`topics[].quiz\` |  | 题目数组，见下 |
| \`topics[].prereq\` |  | 前置主题 id，构成学习路径 |
:::

::: tip 测验题格式
\`\`\`json
{ "type": "single", "q": "题干", "options": ["A","B","C"], "answer": [0], "explain": "解析" }
{ "type": "multi",  "q": "题干", "options": ["A","B","C"], "answer": [0,2] }
{ "type": "judge",  "q": "判断题", "answer": true }
{ "type": "fill",   "q": "填空题", "answer": "答案" }
\`\`\`
\`type\` 省略时默认 \`single\`。
:::
`;

  /* ============================================================
   * 视图：搜索结果
   * ============================================================ */
  function viewSearch(q) {
    const page = el('div', { class: 'page' });
    page.appendChild(el('div', { class: 'topic-hero' },
      el('h1', {}, `🔍 搜索：${esc(q)}`),
      el('p', { class: 'lede' }, '标题、标签、正文都会匹配。')
    ));

    const results = searchAll(q);
    if (!results.length) {
      page.appendChild(el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'e-icon' }, '🔍'),
          el('div', { class: 'e-t' }, '没有找到相关内容'),
          el('div', {}, '换个关键词，或者在"内容与设置"里导入新的学习包')
        )
      ));
      return page;
    }

    page.appendChild(el('div', { class: 'small muted mb-4' }, `找到 ${results.length} 条结果`));
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    results.forEach((r) => {
      list.appendChild(el('a', {
        class: 'card hoverable',
        href: '#',
        style: 'padding:14px 16px;text-decoration:none;color:inherit;display:block',
        onclick: (e) => { e.preventDefault(); navigate(r.path); },
      },
        el('div', { class: 'row', style: 'margin-bottom:4px' },
          el('span', { class: 'badge brand' }, r.where),
          el('strong', { style: 'font-size:14px' }, r.title)
        ),
        el('div', { class: 'small muted', html: r.snippet })
      ));
    });
    page.appendChild(list);
    return page;
  }

  function searchAll(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out = [];

    window.LS.content.topics.forEach((t) => {
      const inTitle = t.title.toLowerCase().includes(s);
      const inTags = (t.tags || []).some((x) => String(x).toLowerCase().includes(s));
      const inSummary = (t.summary || '').toLowerCase().includes(s);
      const inBody = t.lessonText && t.lessonText.toLowerCase().includes(s);

      if (inTitle || inTags || inSummary) {
        out.push({
          where: t.packTitle,
          title: t.title,
          snippet: highlight(t.summary || (t.nodes || []).map((n) => n.title).join('、'), s),
          path: '/topic/' + t.key,
          score: (inTitle ? 10 : 0) + (inTags ? 5 : 0) + (inSummary ? 3 : 0),
        });
      } else if (inBody) {
        // 正文命中：摘出上下文
        const idx = t.lessonText.toLowerCase().indexOf(s);
        const start = Math.max(0, idx - 40);
        const snippet = t.lessonText.slice(start, idx + s.length + 90).replace(/\n/g, ' ');
        out.push({
          where: t.packTitle,
          title: t.title,
          snippet: '…' + highlight(snippet, s) + '…',
          path: '/topic/' + t.key,
          score: 4,
        });
      }

      t.nodes.forEach((n) => {
        if (n.title.toLowerCase().includes(s) && !inTitle) {
          out.push({
            where: t.title,
            title: n.title,
            snippet: '学习点',
            path: '/topic/' + t.key + '?node=' + n.id,
            score: 6,
          });
        }
      });
    });

    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  }

  function highlight(text, s) {
    const i = text.toLowerCase().indexOf(s);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + s.length)) + '</mark>' + esc(text.slice(i + s.length));
  }

  /* ============================================================
   * 视图：404
   * ============================================================ */
  function viewNotFound(msg) {
    return el('div', { class: 'page' },
      el('div', { class: 'card' },
        el('div', { class: 'empty' },
          el('div', { class: 'e-icon' }, '🧭'),
          el('div', { class: 'e-t' }, msg || '页面不存在'),
          el('div', { class: 'mt-4' },
            el('a', { class: 'btn btn-primary', href: '#/' }, '回学习总览')
          )
        )
      )
    );
  }

  /* ============================================================
   * 路由注册
   * ============================================================ */
  route('/', () => viewDashboard());
  route('/topic/:pack/:topic', (p) => viewTopic(p.pack, p.topic));
  route('/quiz/:pack/:topic', (p) => viewQuiz(p.pack, p.topic));
  route('/review', () => viewReview());
  route('/plan', () => viewPlan());
  route('/stats', () => viewStats());
  route('/manage', () => viewManage());
  route('/search', (p, q) => viewSearch(q.q || ''));
  route('/practice', () => window.LS.practice.viewPlayground(navigate));
  route('/practice/:problemId', (p) => window.LS.practice.viewProblem(p.problemId, navigate));
  route('/challenges', () => window.LS.practice.viewProblem('', navigate));

  /* ============================================================
   * 渲染入口
   * ============================================================ */
  let currentTocCleanup = null;

  function render() {
    const { path, query } = parseHash();
    let view = null;
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        try {
          view = r.handler(params, query);
        } catch (e) {
          console.error(e);
          view = viewNotFound('页面渲染出错：' + e.message);
        }
        break;
      }
    }
    if (!view) view = viewNotFound('路径不存在：' + path);

    const main = $('.main');
    main.innerHTML = '';
    main.appendChild(view);

    renderSidebar();

    // 处理 ?node= 参数：滚动到节点
    if (query.node) {
      setTimeout(() => {
        const target = document.getElementById('node-' + query.node);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }

    // 移动端：切换页面时收起侧栏
    if (window.innerWidth <= 860) $('.sidebar')?.classList.remove('open');

    // 记录学习时间（每 30 秒一次，只在非首页时记）
    if (path !== '/') store.touchLog(30, 0);
  }

  /* ============================================================
   * 全局事件
   * ============================================================ */
  function applyTheme() {
    const t = store.state().settings.theme;
    document.documentElement.dataset.theme = t;
  }

  function applyFontScale() {
    document.documentElement.style.setProperty('--font-scale', store.state().settings.fontScale);
  }

  function exportProgress() {
    const data = store.exportState();
    download(`学习进度-${store.todayKey()}.json`, data);
  }

  function importProgress() {
    const input = el('input', { type: 'file', accept: '.json' });
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const res = store.importState(String(r.result));
          toast(`已导入 ${res.nodes} 个节点进度`);
          setTimeout(() => location.reload(), 500);
        } catch (e) {
          alert('导入失败：' + e.message);
        }
      };
      r.readAsText(f, 'utf-8');
    };
    input.click();
  }

  function downloadPackTemplate() {
    const tpl = {
      id: 'my-pack',
      title: '我的学习包',
      version: '1.0.0',
      color: '#4f7cff',
      topics: [{
        id: 'first-topic',
        title: '第一个主题',
        summary: '一句话说明这一主题讲什么',
        tags: ['入门'],
        estMin: 20,
        lesson: '# 第一个主题\n\n在这里写 Markdown 正文。\n\n::: key\n重点内容用容器高亮。\n:::\n',
        nodes: [
          { id: 'n1', title: '知识点一', key: true },
          { id: 'n2', title: '知识点二' },
        ],
        quiz: [
          { type: 'single', q: '示例单选题？', options: ['A 选项', 'B 选项'], answer: [0], explain: '解析说明。' },
        ],
      }],
    };
    download('内容包模板.json', JSON.stringify(tpl, null, 2));
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- 搜索框 ---------- */
  function setupSearch() {
    const input = $('#global-search');
    const drop = $('.search-drop');
    let activeIdx = -1;
    let items = [];

    function close() {
      drop.hidden = true;
      activeIdx = -1;
    }

    function update() {
      const q = input.value.trim();
      if (!q) { close(); return; }
      items = searchAll(q).slice(0, 12);
      drop.innerHTML = '';
      activeIdx = -1;

      if (!items.length) {
        drop.appendChild(el('div', { class: 'sr-empty' }, '没有匹配结果'));
        drop.hidden = false;
        return;
      }
      items.forEach((r, i) => {
        const item = el('div', { class: 'sr-item' },
          el('div', { class: 'sr-t', html: highlight(r.title, q.toLowerCase()) }),
          el('div', { class: 'sr-d', html: r.where + ' · ' + r.snippet })
        );
        item.addEventListener('click', () => {
          navigate(r.path);
          close();
          input.value = '';
          input.blur();
        });
        item.addEventListener('mouseenter', () => {
          activeIdx = i;
          $$('.sr-item', drop).forEach((x, j) => x.classList.toggle('active', j === i));
        });
        drop.appendChild(item);
      });
      drop.hidden = false;
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); input.blur(); return; }
      if (drop.hidden || !items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && items[activeIdx]) {
          navigate(items[activeIdx].path);
          close();
          input.value = '';
          input.blur();
        } else {
          navigate('/search?q=' + encodeURIComponent(input.value.trim()));
          close();
          input.blur();
        }
        return;
      } else return;
      $$('.sr-item', drop).forEach((x, j) => x.classList.toggle('active', j === activeIdx));
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search')) close();
    });

    // 全局快捷键
    let lastKey = '';
    let lastKeyTime = 0;
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !isTyping) {
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }
      if (isTyping) return;
      if (e.key === '?') { navigate('/manage'); return; }

      // g + 字母 导航
      const now = Date.now();
      if (lastKey === 'g' && now - lastKeyTime < 900) {
        const map = { h: '/', r: '/review', p: '/plan', s: '/stats', m: '/manage' };
        if (map[e.key]) { navigate(map[e.key]); lastKey = ''; return; }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        lastKey = e.key;
        lastKeyTime = now;
      }
    });
  }

  /* ---------- 顶部按钮 ---------- */
  function setupTopbar() {
    $('#btn-theme').addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      const cur = store.state().settings.theme;
      const next = order[(order.indexOf(cur) + 1) % 3];
      store.setSetting('theme', next);
      applyTheme();
      applyFontScale();
      toast({ auto: '跟随系统', light: '浅色', dark: '深色' }[next]);
    });

    $('#btn-menu').addEventListener('click', () => {
      const side = $('.sidebar');
      side.classList.toggle('open');
      let mask = $('.sidebar-mask');
      if (side.classList.contains('open')) {
        if (!mask) {
          mask = el('div', { class: 'sidebar-mask', onclick: () => { side.classList.remove('open'); mask.remove(); } });
          document.body.appendChild(mask);
        }
      } else if (mask) mask.remove();
    });

    $('#btn-review').addEventListener('click', () => navigate('/review'));
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function boot() {
    if (!window.__LS_CONTENT__) {
      document.body.innerHTML = `
        <div style="max-width:600px;margin:80px auto;padding:32px;font:15px/1.7 system-ui;
             border:1px solid #e3e6ef;border-radius:16px">
          <h2 style="margin:0 0 12px">⚠️ 找不到内容文件</h2>
          <p style="color:#545a75">缺少 <code>content.bundle.js</code>。请在工坊根目录运行：</p>
          <pre style="background:#f6f7fb;padding:12px;border-radius:8px">node tools/build-content.mjs</pre>
          <p style="color:#868da8;font-size:13px">或者双击根目录的 <b>一键启动.bat</b>，它会自动完成构建。</p>
        </div>`;
      return;
    }

    registry.reload();
    applyTheme();
    applyFontScale();
    setupSearch();
    setupTopbar();

    // 进度条自动更新
    store.subscribe(() => {
      // 只更新侧栏进度，不重渲染整个页面（避免输入框失焦）
      const stats = store.stats();
      const bar = $('.sidebar .progress > i');
      if (bar) bar.style.width = stats.pct + '%';
    });

    window.addEventListener('hashchange', render);

    // 页面停留计时：每 30 秒累计一次学习时长
    setInterval(() => {
      if (document.visibilityState === 'visible' && parseHash().path !== '/') {
        store.touchLog(30, 0);
      }
    }, 30000);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

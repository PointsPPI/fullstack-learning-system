/* ============================================================
 * polish.js —— v2.0.1 交互增强
 * ------------------------------------------------------------
 * 这里只做 CSS 做不到的事。每条都对应一个真实的体验问题：
 *
 *   ① 滚动时顶栏阴影加深        —— 让"页面已滚动"有物理感
 *   ② 数字滚动计数              —— 统计值直接跳变太生硬
 *   ③ 进度条宽度从 0 增长        —— 让"进度"可感知
 *   ④ 节点状态切换时"弹一下"     —— 点击后要立刻看到反馈
 *   ⑤ 键盘快捷键 j/k 上下选中    —— 列表浏览不用鼠标
 *   ⑥ 页面切换时回到顶部         —— 否则新页面停在半截
 *   ⑦ 复制成功的轻提示           —— 复制按钮已有，但缺反馈
 *   ⑧ 热力图空态引导            —— 全灰格子不知道干什么
 *   ⑨ 主题切换时的平滑过渡       —— 瞬间闪白很刺眼
 *   ⑩ 侧栏折叠动画               —— 展开/收起更自然
 *
 * 设计原则：**不拦截原有逻辑，只做叠加**。
 * 所有增强都是"在旁边加一层"，即使 polish.js 加载失败，
 * 原系统功能也完全不受影响。
 * ============================================================ */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
   * ① 滚动时顶栏阴影
   * ============================================================ */
  function setupScrollShadow() {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        document.body.classList.toggle('scrolled', window.scrollY > 8);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
   * ② 数字滚动计数
   * ------------------------------------------------------------
   * 用 requestAnimationFrame 做缓动，而不是 setInterval。
   * 原因：rAF 与浏览器刷新同步，不会掉帧/卡顿；
   *      setInterval 在后台标签页还会继续跑，浪费 CPU。
   *
   * 缓动用 easeOutCubic：开始快、结束慢，符合"数字收敛"的直觉。
   * ============================================================ */
  function animateNumber(node, to, duration = 620) {
    if (reduced()) {
      node.textContent = String(to);
      return;
    }
    const from = Number(String(node.textContent).replace(/[^\d.-]/g, '')) || 0;
    if (from === to) return;

    const t0 = performance.now();
    const suffix = /[^\d.-]/.test(node.textContent)
      ? node.textContent.replace(/[\d.-]/g, '')
      : '';

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);   // easeOutCubic
      const v = Math.round(from + (to - from) * eased);
      node.textContent = v + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else node.textContent = to + suffix;
    };
    requestAnimationFrame(tick);
  }

  /** 给所有 .stat .s-v 挂上数字动画 */
  function setupCounters() {
    const targets = $$('.stat .s-v');
    if (!targets.length) return;

    // 用 IntersectionObserver：只有真正可见时才动画，
    // 避免"在页面底部还没滚到就开始数完了"
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting || e.target.dataset.counted) return;
        e.target.dataset.counted = '1';
        const raw = e.target.textContent.trim();
        const num = Number(raw.replace(/[^\d.-]/g, ''));
        if (Number.isFinite(num) && raw.match(/\d/)) {
          e.target.textContent = '0' + raw.replace(/[\d.-]/g, '');
          animateNumber(e.target, num);
        }
        io.unobserve(e.target);
      });
    }, { threshold: 0.4 });

    targets.forEach((t) => io.observe(t));
  }

  /* ============================================================
   * ③ 进度条从 0 增长
   * ============================================================ */
  function setupProgressGrowth() {
    $$('.progress > i').forEach((bar) => {
      const target = bar.style.width;
      if (!target || reduced()) return;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => { bar.style.width = target; }, 60);
      });
    });
  }

  /* ============================================================
   * ④ 节点状态切换时"弹一下"
   * ------------------------------------------------------------
   * 原实现在点击后整页 render()，视觉上是"闪一下就没了"。
   * 这里用 MutationObserver 无法捕获（因为整块被替换），
   * 所以改用事件委托：点击 node-item 里的按钮时，
   * 手动给最近的 node-item 加 pop 类。
   * ============================================================ */
  function setupNodePop() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.node-item button');
      if (!btn) return;
      const item = btn.closest('.node-item');
      if (!item) return;
      item.classList.add('pop');
      setTimeout(() => item.classList.remove('pop'), 400);

      // 成功反馈：如果按钮变成"已掌握"，给个绿色闪动
      setTimeout(() => {
        const now = item.querySelector('button');
        if (now && now.textContent.includes('已掌握')) {
          toast('已标记为掌握 ✓', 'success');
        }
      }, 40);
    });
  }

  /* ============================================================
   * ⑤ 键盘导航 j/k
   * ============================================================ */
  function setupListNav() {
    let lastKey = '';
    let lastAt = 0;

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // j / k：在节点清单里上下移动
      if (key === 'j' || key === 'k') {
        const items = $$('.node-item');
        if (!items.length) return;
        e.preventDefault();

        let idx = items.findIndex((it) => it.classList.contains('nav-focus'));
        if (idx === -1) idx = key === 'j' ? -1 : items.length;

        idx = key === 'j' ? Math.min(idx + 1, items.length - 1)
                          : Math.max(idx - 1, 0);

        items.forEach((it) => it.classList.remove('nav-focus'));
        const cur = items[idx];
        cur.classList.add('nav-focus');
        cur.style.outline = '2px solid var(--c-brand)';
        cur.style.outlineOffset = '1px';
        cur.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });

        // 清除其他项的高亮
        items.forEach((it, i) => {
          if (i !== idx) { it.style.outline = ''; it.style.outlineOffset = ''; }
        });
        return;
      }

      // Enter：触发当前选中项的主按钮
      if (e.key === 'Enter') {
        const cur = $('.node-item.nav-focus');
        if (cur) {
          const btn = cur.querySelector('button');
          if (btn) { e.preventDefault(); btn.click(); }
        }
        return;
      }

      // Escape：取消选中
      if (e.key === 'Escape') {
        $$('.node-item.nav-focus').forEach((it) => {
          it.classList.remove('nav-focus');
          it.style.outline = '';
        });
      }
    });
  }

  /* ============================================================
   * ⑥ 页面切换时回到顶部
   * ------------------------------------------------------------
   * 原系统 hash 路由切换后，滚动位置保留在上一页的位置，
   * 用户体验很割裂（新页面从中间开始看）。
   * ============================================================ */
  function setupScrollReset() {
    let lastHash = location.hash;
    window.addEventListener('hashchange', () => {
      const newHash = location.hash;
      const changedRoute = newHash.split('?')[0] !== lastHash.split('?')[0];
      lastHash = newHash;

      if (changedRoute) {
        // 用 instant 而非 smooth：切页面要"立刻在顶部"，
        // 平滑滚动反而让人以为"还在上一页"
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      }
    });
  }

  /* ============================================================
   * ⑦ Toast（轻提示）
   * ------------------------------------------------------------
   * 独立实现，不依赖 app.js 的 toast，避免耦合。
   * 支持 success / error / info 三种语义色。
   * ============================================================ */
  function toast(msg, type = 'info', ms = 2000) {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 240);
    }, ms);
  }

  /* ============================================================
   * ⑧ 热力图空态引导
   * ------------------------------------------------------------
   * 实测问题：新用户看到 140 个灰格子，完全不知道这是干什么的。
   * 解法：在热力图下方加一句"怎么让它变绿"的引导。
   * ============================================================ */
  function setupHeatmapHint() {
    const hm = $('.heatmap');
    if (!hm || hm.dataset.hinted) return;
    hm.dataset.hinted = '1';

    // 统计有多少个有色格子
    const active = $$('.hm-cell', hm).filter(
      (c) => /l[1-4]/.test(c.className)
    ).length;

    if (active === 0) {
      const hint = document.createElement('div');
      hint.className = 'small muted';
      hint.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      hint.innerHTML =
        '<span>还没有学习记录 —— 打开任意主题读 1 分钟，这里就会出现第一个绿点。</span>';
      hm.parentNode.insertBefore(hint, hm.nextSibling);
    }
  }

  /* ============================================================
   * ⑨ 主题切换平滑过渡
   * ------------------------------------------------------------
   * 深浅色切换时，瞬间变色很刺眼。
   * 加一个短暂的全局过渡，让颜色"渐变"过去。
   *
   * 关键细节：过渡结束后必须移除这个类，
   * 否则后续所有交互都会带上颜色过渡（页面切换会变卡）。
   * ============================================================ */
  function setupThemeTransition() {
    const observer = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.attributeName === 'data-theme') {
          document.documentElement.style.setProperty('transition', 'none');
          document.body.classList.add('theme-changing');
          setTimeout(() => {
            document.body.classList.remove('theme-changing');
          }, 320);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
  }

  /* ============================================================
   * ⑩ 侧栏折叠动画
   * ------------------------------------------------------------
   * 原本是整个 DOM 重建（瞬间切换）。
   * 这里在重建前后加一个短暂的过渡类。
   * ============================================================ */
  function setupSidebarMotion() {
    document.addEventListener('click', (e) => {
      const head = e.target.closest('.pack-head');
      if (!head) return;
      const group = head.closest('.pack-group');
      if (!group || reduced()) return;

      const body = group.querySelector('.pack-body');
      if (!body) return;

      // 记录当前高度，播放"收起"动画（DOM 重建本身会立刻生效，
      // 所以这里只做一个视觉上的收尾提示）
      group.style.transition = 'opacity 160ms ease';
      group.style.opacity = '0.55';
      setTimeout(() => {
        group.style.opacity = '';
        group.style.transition = '';
      }, 160);
    });
  }

  /* ============================================================
   *  增强：代码块复制反馈
   * ============================================================ */
  function setupCopyFeedback() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.code-copy');
      if (!btn) return;
      // app.js 已经把文案改成"已复制 ✓"，这里补一个 toast
      setTimeout(() => {
        if (btn.textContent.includes('已复制')) {
          toast('代码已复制到剪贴板', 'success', 1500);
        }
      }, 30);
    });
  }

  /* ============================================================
   *  初始化
   * ============================================================ */
  function init() {
    setupScrollShadow();
    setupScrollReset();
    setupThemeTransition();
    setupCopyFeedback();
    setupNodePop();
    setupListNav();
    setupSidebarMotion();

    // 每次渲染后需要重新处理的部分
    const refresh = () => {
      setupCounters();
      setupProgressGrowth();
      setupHeatmapHint();
    };
    refresh();

    // hashchange 后（页面已重渲染完）再刷新一次
    window.addEventListener('hashchange', () => {
      setTimeout(refresh, 80);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LS = window.LS || {};
  window.LS.polish = { toast, animateNumber };
})();

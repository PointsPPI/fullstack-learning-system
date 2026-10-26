/* ============================================================
 * store.js —— 学习系统状态层
 * ------------------------------------------------------------
 * 两个状态源，严格分开：
 *
 *   ① 内容（CONTENT）  只读，来自 content.bundle.js / 用户导入
 *   ② 学习状态（STATE） 可写，存 localStorage
 *
 * 分开的意义：内容包可以随意替换/升级/新增，学习进度永远不会丢，
 * 因为进度只记 「包id/主题id/节点id」 这种稳定 key，不记内容本身。
 *
 * 状态结构（v1）：
 * {
 *   schema: 1,
 *   nodes: { "pack/topic/node": { s: 0|1|2, t: 时间戳, n: 笔记, bm: 书签, rv: 复习数据 } },
 *   quiz:  { "pack/topic": { best: 分数, total: 题数, at: 时间, wrong: [题索引] } },
 *   log:   [ { d: "2026-10-25", sec: 1800, n: 12 } ],      每日学习记录
 *   plan:  [ { id, title, topicKey, due, done } ],          自定学习计划
 *   settings: { theme, dailyGoalMin, fontScale }
 * }
 * ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'ls.state.v1';
  const SCHEMA = 1;

  /* ---------- 节点状态常量 ---------- */
  const S = {
    NEW: 0,       // 未开始
    LEARNING: 1,  // 学习中
    MASTERED: 2,  // 已掌握
  };
  const S_LABEL = ['未开始', '学习中', '已掌握'];

  /* ---------- 默认状态 ---------- */
  function defaultState() {
    return {
      schema: SCHEMA,
      nodes: {},
      quiz: {},
      log: [],
      plan: [],
      settings: { theme: 'auto', dailyGoalMin: 30, fontScale: 1, codeWrap: false },
      createdAt: Date.now(),
    };
  }

  /* ---------- 读写 ---------- */
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      if (!s || s.schema !== SCHEMA) {
        // 未来版本迁移入口
        return migrate(s) || defaultState();
      }
      // 补齐缺失字段（老数据兼容）
      const d = defaultState();
      return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
    } catch (e) {
      console.warn('[store] 读取失败，使用默认状态', e);
      return defaultState();
    }
  }

  function migrate(old) {
    if (!old) return null;
    // 示例：v0 → v1。当前没有历史版本，占位以便将来扩展
    return { ...defaultState(), ...old, schema: SCHEMA };
  }

  let saveTimer = null;
  function persist() {
    // 防抖：阅读时会频繁标记，避免每次动作都写盘
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch (e) {
        // 配额满（通常是笔记太多）→ 明确告知，而不是静默丢数据
        console.error('[store] 保存失败（可能 localStorage 已满）', e);
        window.dispatchEvent(new CustomEvent('ls:quota-exceeded'));
      }
    }, 240);
  }

  function commit() {
    persist();
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---------- 节点操作 ---------- */
  function nodeKey(topicKey, nodeId) {
    return `${topicKey}/${nodeId}`;
  }

  function getNode(key) {
    const n = state.nodes[key];
    return n
      ? { status: S.NEW, ...n }
      : { status: S.NEW, ts: 0, note: '', bookmark: false, rv: null };
  }

  function setNodeStatus(key, status) {
    const cur = getNode(key);
    const wasNew = cur.status === S.NEW;
    state.nodes[key] = {
      ...cur,
      status,
      ts: Date.now(),
      // 首次开始学习 → 建立复习节奏
      rv: cur.rv || (status !== S.NEW ? makeReview(Date.now()) : null),
    };
    if (status === S.MASTERED && (!cur.rv || cur.rv.stage === 0)) {
      state.nodes[key].rv = makeReview(Date.now());
    }
    if (wasNew && status !== S.NEW) touchLog(0, 1);
    commit();
  }

  function setNodeNote(key, text) {
    const cur = getNode(key);
    state.nodes[key] = { ...cur, note: text, ts: Date.now() };
    commit();
  }

  function toggleBookmark(key) {
    const cur = getNode(key);
    state.nodes[key] = { ...cur, bookmark: !cur.bookmark };
    commit();
  }

  /* ---------- 艾宾浩斯复习调度 ----------
   * 间隔序列（天）：0 → 1 → 2 → 4 → 7 → 15 → 30
   * 每完成一次复习，stage +1，nextAt 后移。
   * 这是间隔重复的最小可用实现，够用且不需要算法库。
   */
  const REVIEW_DAYS = [0, 1, 2, 4, 7, 15, 30];

  function makeReview(now) {
    return { stage: 1, nextAt: now + REVIEW_DAYS[1] * 86400000, lastAt: now, lapses: 0 };
  }

  function advanceReview(key) {
    const cur = getNode(key);
    if (!cur.rv) return;
    const stage = Math.min((cur.rv.stage || 0) + 1, REVIEW_DAYS.length - 1);
    const now = Date.now();
    state.nodes[key] = {
      ...cur,
      rv: { ...cur.rv, stage, lastAt: now, nextAt: now + (REVIEW_DAYS[stage] || 30) * 86400000 },
    };
    touchLog(60, 0);
    commit();
  }

  function resetReview(key) {
    const cur = getNode(key);
    // 遗忘 → 回到第 1 阶段，lapses 记录忘记次数
    state.nodes[key] = {
      ...cur,
      rv: { stage: 1, lastAt: Date.now(), nextAt: Date.now() + 86400000, lapses: (cur.rv?.lapses || 0) + 1 },
    };
    commit();
  }

  function dueReviews() {
    const now = Date.now();
    const out = [];
    Object.entries(state.nodes).forEach(([key, n]) => {
      if (n.rv && n.status !== S.NEW && n.rv.nextAt <= now) out.push({ key, ...n });
    });
    return out.sort((a, b) => a.rv.nextAt - b.rv.nextAt);
  }

  /* ---------- 测验记录 ---------- */
  function recordQuiz(topicKey, score, total, wrong) {
    const prev = state.quiz[topicKey];
    const best = Math.max(score, prev?.best || 0);
    state.quiz[topicKey] = {
      best,
      last: score,
      total,
      at: Date.now(),
      attempts: (prev?.attempts || 0) + 1,
      wrong: wrong || [],
    };
    touchLog(120, 0);
    commit();
  }

  function quizHistory(topicKey) {
    return state.quiz[topicKey] || null;
  }

  /* ---------- 学习日志 ---------- */
  function todayKey(d) {
    const dt = d || new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }

  function touchLog(sec, newNodeCount) {
    const k = todayKey();
    let rec = state.log.find((x) => x.d === k);
    if (!rec) {
      rec = { d: k, sec: 0, n: 0 };
      state.log.push(rec);
    }
    rec.sec += sec || 0;
    rec.n += newNodeCount || 0;
    // 只保留最近 400 天
    if (state.log.length > 400) state.log = state.log.slice(-400);
    persist();
  }

  function logFor(d) {
    return state.log.find((x) => x.d === (d || todayKey())) || { d: d || todayKey(), sec: 0, n: 0 };
  }

  function streak() {
    const set = new Set(state.log.filter((x) => x.sec > 0 || x.n > 0).map((x) => x.d));
    let s = 0;
    const d = new Date();
    // 今天没学不算断（还没结束）——从今天开始往回数
    for (let i = 0; i < 400; i++) {
      const k = todayKey(d);
      if (set.has(k)) s++;
      else if (i === 0) { /* 今天还没学，继续看昨天 */ }
      else break;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }

  /* ---------- 计划 ---------- */
  function addPlan(title, topicKey, due) {
    state.plan.push({
      id: 'p' + Date.now().toString(36),
      title, topicKey, due: due || null, done: false, at: Date.now(),
    });
    commit();
  }
  function togglePlan(id) {
    const p = state.plan.find((x) => x.id === id);
    if (p) { p.done = !p.done; commit(); }
  }
  function removePlan(id) {
    state.plan = state.plan.filter((x) => x.id !== id);
    commit();
  }

  /* ---------- 设置 ---------- */
  function setSetting(k, v) {
    state.settings[k] = v;
    commit();
  }

  /* ---------- 进度统计 ---------- */
  function stats() {
    const all = [];
    (window.LS.content?.topics || []).forEach((t) => {
      (t.nodes || []).forEach((n) => all.push(nodeKey(t.key, n.id)));
    });
    let learning = 0, mastered = 0, bm = 0, notes = 0;
    all.forEach((k) => {
      const n = state.nodes[k];
      if (!n) return;
      if (n.status === S.LEARNING) learning++;
      if (n.status === S.MASTERED) mastered++;
      if (n.bookmark) bm++;
      if (n.note) notes++;
    });
    const total = all.length || 1;
    return {
      total: all.length,
      learning, mastered, bookmark: bm, notes,
      newCount: all.length - learning - mastered,
      pct: Math.round(((learning * 0.4 + mastered) / total) * 100),
      due: dueReviews().length,
    };
  }

  /* ---------- 导入 / 导出 ---------- */
  function exportState() {
    return JSON.stringify({ ...state, exportedAt: Date.now(), app: 'learning-system' }, null, 2);
  }

  function importState(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    if (!obj || typeof obj !== 'object' || !obj.nodes) {
      throw new Error('不是有效的学习进度文件（缺少 nodes 字段）');
    }
    state = { ...defaultState(), ...obj, schema: SCHEMA };
    commit();
    return { nodes: Object.keys(state.nodes).length };
  }

  function resetAll() {
    state = defaultState();
    commit();
  }

  /* ---------- 导出到全局 ---------- */
  window.LS = window.LS || {};
  window.LS.store = {
    S, S_LABEL, REVIEW_DAYS,
    state: () => state,
    subscribe, commit,
    nodeKey, getNode, setNodeStatus, setNodeNote, toggleBookmark,
    advanceReview, resetReview, dueReviews,
    recordQuiz, quizHistory,
    touchLog, logFor, streak, todayKey,
    addPlan, togglePlan, removePlan,
    setSetting, stats,
    exportState, importState, resetAll,
  };
})();

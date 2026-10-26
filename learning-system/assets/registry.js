/* ============================================================
 * registry.js —— 内容注册表（内核视角的内容层）
 * ------------------------------------------------------------
 * 内核只认这里的数据结构，不认识任何具体知识点。
 *
 * 内容来源（按优先级合并）：
 *   1. content.bundle.js           构建产物（外包内置内容）
 *   2. localStorage 里的导入包     用户在学习系统里「导入」的 .json 内容包
 *
 * 合并后统一成一个扁平结构：
 *   LS.content = {
 *     packs: [ { id, title, ... , topics: [...] } ],
 *     topics: [ { key:"packId/topicId", packId, packTitle, id, title, ... } ],
 *     index: { "packId/topicId": topic }
 *   }
 *
 * 这样视图层永远只面对 LS.content.topics，不用关心内容从哪来。
 * ============================================================ */
(function () {
  'use strict';

  const IMPORT_KEY = 'ls.importedPacks.v1';

  function readImported() {
    try {
      const raw = localStorage.getItem(IMPORT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeImported(arr) {
    localStorage.setItem(IMPORT_KEY, JSON.stringify(arr));
  }

  /* ---------- 校验导入的内容包（与 build-content.mjs 同规则，运行时兜底） ---------- */
  const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

  function validatePack(meta) {
    const errs = [];
    if (!meta || typeof meta !== 'object') return ['不是 JSON 对象'];
    ['id', 'title', 'version'].forEach((k) => {
      if (!meta[k]) errs.push(`缺少必填字段 "${k}"`);
    });
    if (meta.id && !ID_RE.test(meta.id)) errs.push('id 只能是小写字母/数字/连字符');
    if (!Array.isArray(meta.topics) || !meta.topics.length) errs.push('topics 必须是非空数组');
    (meta.topics || []).forEach((t, i) => {
      if (!t.id) errs.push(`topics[${i}] 缺少 id`);
      if (!t.title) errs.push(`topics[${i}] 缺少 title`);
      if (t.id && !ID_RE.test(t.id)) errs.push(`topics[${i}].id "${t.id}" 不合规`);
    });
    return errs;
  }

  /* ---------- 合并构建产物 ---------- */
  function buildFromBundle() {
    const b = window.__LS_CONTENT__;
    if (!b || !Array.isArray(b.packs)) return [];
    return b.packs.map((p) => ({
      ...p.meta,
      packDir: p.packDir,
      source: 'bundle',
      topics: p.topics.map((t) => ({ ...t, lessonText: t.lessonText || '' })),
    }));
  }

  /* ---------- 归一化：packs → 扁平 topics ---------- */
  function normalize(packs) {
    // 同 id 的包：导入包覆盖内置包（方便你更新内容）
    const byId = new Map();
    packs.forEach((p) => {
      byId.set(p.id, p);
    });
    const merged = [...byId.values()];
    const topics = [];
    const index = {};

    merged.forEach((p) => {
      const packTitle = p.title;
      (p.topics || []).forEach((t) => {
        const key = `${p.id}/${t.id}`;
        const topic = {
          ...t,
          key,
          packId: p.id,
          packTitle,
          packColor: p.color || hashColor(p.id),
          nodes: t.nodes && t.nodes.length ? t.nodes : [{ id: 'main', title: t.title, key: true }],
          prereq: t.prereq || [],
          lessonText: t.lessonText || '',
          source: p.source,
        };
        topics.push(topic);
        index[key] = topic;
      });
    });

    // 排序：包内按 pack 里 topics 声明顺序已保留，包间按包 title
    return { packs: merged, topics, index };
  }

  function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    const palette = ['#4f7cff', '#0ea5a4', '#e0674f', '#8b5cf6', '#d9a521', '#e05c8c', '#3b9a4a', '#5b8def'];
    return palette[Math.abs(h) % palette.length];
  }

  /* ---------- 公开 API ---------- */
  const registry = {
    /** 重新构建（导入/删除包后调用） */
    reload() {
      const packs = [...buildFromBundle(), ...readImported().map((p) => ({ ...p, source: 'imported' }))];
      const norm = normalize(packs);
      window.LS.content = norm;
      return norm;
    },

    /** 导入一个内容包（对象或 JSON 字符串） */
    importPack(input) {
      let meta;
      try {
        meta = typeof input === 'string' ? JSON.parse(input) : input;
      } catch (e) {
        throw new Error('JSON 格式错误：' + e.message);
      }
      const errs = validatePack(meta);
      if (errs.length) throw new Error('内容包不合格：\n· ' + errs.join('\n· '));

      const list = readImported().filter((p) => p.id !== meta.id);
      list.push(meta);
      writeImported(list);
      registry.reload();
      return { id: meta.id, topics: meta.topics.length };
    },

    /** 导出内置 + 导入的全部内容（用于备份） */
    exportAll() {
      return JSON.stringify({ schemaVersion: 1, packs: window.LS.content.packs.map(stripRuntime) }, null, 2);
    },

    /** 删除一个导入包（内置包不可删） */
    removePack(id) {
      const list = readImported().filter((p) => p.id !== id);
      writeImported(list);
      registry.reload();
    },

    /** 已导入包列表 */
    importedPacks() {
      return readImported().map((p) => ({ id: p.id, title: p.title, version: p.version, topics: (p.topics || []).length }));
    },

    /** 校验但不导入（给导入界面做预检） */
    preview(input) {
      let meta;
      try {
        meta = typeof input === 'string' ? JSON.parse(input) : input;
      } catch (e) {
        return { ok: false, errors: ['JSON 格式错误：' + e.message] };
      }
      const errs = validatePack(meta);
      return {
        ok: errs.length === 0,
        errors: errs,
        info: errs.length === 0
          ? {
              id: meta.id,
              title: meta.title,
              version: meta.version,
              topics: meta.topics.length,
              nodes: meta.topics.reduce((s, t) => s + ((t.nodes && t.nodes.length) || 1), 0),
            }
          : null,
      };
    },

    /** 取全部节点（视图层常用） */
    allNodes() {
      const out = [];
      window.LS.content.topics.forEach((t) => {
        t.nodes.forEach((n) => {
          out.push({ topic: t, node: n, key: `${t.key}/${n.id}` });
        });
      });
      return out;
    },

    /** 按 key 找主题 */
    topic(key) {
      return window.LS.content.index[key] || null;
    },

    /** 全局搜索：只在标题/标签/节点名上做（正文搜索见 search.js 索引） */
    searchMeta(q, limit = 30) {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const res = [];
      window.LS.content.topics.forEach((t) => {
        let score = 0;
        if (t.title.toLowerCase().includes(s)) score += 10;
        if ((t.tags || []).some((x) => x.toLowerCase().includes(s))) score += 6;
        if (t.packTitle.toLowerCase().includes(s)) score += 3;
        if ((t.summary || '').toLowerCase().includes(s)) score += 2;
        if (score) res.push({ type: 'topic', key: t.key, title: t.title, desc: t.packTitle, score });
        t.nodes.forEach((n) => {
          if (n.title.toLowerCase().includes(s)) {
            res.push({ type: 'node', key: `${t.key}/${n.id}`, title: n.title, desc: t.title, score: 5 });
          }
        });
      });
      return res.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };

  function stripRuntime(p) {
    return {
      ...p,
      topics: (p.topics || []).map((t) => {
        const { quizData, packId, packTitle, packColor, key, source, ...rest } = t;
        return rest;
      }),
    };
  }

  window.LS = window.LS || {};
  window.LS.registry = registry;
})();

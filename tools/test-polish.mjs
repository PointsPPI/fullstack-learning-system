/**
 * 检查 polish.js / polish.css 的完整性
 * ============================================================
 * polish.js 全是 DOM 交互（滚动、键盘、Toast），node 环境跑不了。
 * 但可以静态检查：
 *   ① 语法是否合法（vm.Script 解析）
 *   ② 是否挂载了对外 API
 *   ③ CSS 是否定义了关键类
 *   ④ index.html 是否正确引入
 *   ⑤ HTML 里是否有对应的类名（证明 CSS 真有作用对象）
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LS = path.join(ROOT, 'learning-system');

let pass = 0, fail = 0;
const fails = [];

function t(name, fn) {
  try {
    const d = fn();
    pass++;
    console.log(`  ✓ ${name}${d ? '  ' + d : ''}`);
  } catch (e) {
    fail++;
    fails.push({ name, msg: e.message });
    console.log(`  ✗ ${name}\n     ${e.message}`);
  }
}
const ok = (c, m) => { if (!c) throw new Error(m || '断言失败'); };

console.log('\n  polish 增强层检查\n  ' + '='.repeat(52) + '\n');

/* ---------- 语法 ---------- */
t('polish.js 语法合法', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  new vm.Script(src, { filename: 'polish.js' });
  return `${(src.length / 1024).toFixed(1)} KB`;
});

t('polish.css 语法基本平衡（括号配对）', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  ok(open === close, `花括号不配对：{ ${open} 个，} ${close} 个`);
  return `${open} 个规则块`;
});

/* ---------- index.html 引入 ---------- */
t('index.html 引入 polish.css', () => {
  const h = fs.readFileSync(path.join(LS, 'index.html'), 'utf8');
  ok(h.includes('assets/polish.css'), '缺 link 标签');
});

t('index.html 引入 polish.js', () => {
  const h = fs.readFileSync(path.join(LS, 'index.html'), 'utf8');
  ok(h.includes('assets/polish.js'), '缺 script 标签');
});

t('polish.js 在 app.js 之后加载', () => {
  const h = fs.readFileSync(path.join(LS, 'index.html'), 'utf8');
  const ai = h.indexOf('assets/app.js');
  const pi = h.indexOf('assets/polish.js');
  ok(ai >= 0 && pi > ai, '加载顺序不对：polish 必须在 app 之后（否则覆盖不到）');
});

t('polish.css 在 app.css 之后加载', () => {
  const h = fs.readFileSync(path.join(LS, 'index.html'), 'utf8');
  const ai = h.indexOf('assets/app.css');
  const pi = h.indexOf('assets/polish.css');
  ok(ai >= 0 && pi > ai, '加载顺序不对');
});

/* ---------- 对外 API ---------- */
t('polish.js 暴露 LS.polish API', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes('window.LS.polish'), '没有挂载到 window.LS.polish');
  ok(src.includes('toast'), '缺少 toast');
  ok(src.includes('animateNumber'), '缺少 animateNumber');
});

/* ---------- 关键交互实现 ---------- */
t('实现了滚动阴影', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes("classList.toggle('scrolled'"), '缺少 scrolled 类切换');
});

t('实现了数字滚动', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes('requestAnimationFrame'), '没用 rAF');
  ok(src.includes('easeOutCubic') || src.includes('Math.pow(1 - p, 3)'), '缺少缓动');
});

t('实现了键盘 j/k 导航', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes("key === 'j'") && src.includes("key === 'k'"), '缺少 j/k 处理');
});

t('实现了切页回到顶部', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes('scrollTo'), '缺少 scrollTo');
});

t('尊重 prefers-reduced-motion', () => {
  const src = fs.readFileSync(path.join(LS, 'assets/polish.js'), 'utf8');
  ok(src.includes('prefers-reduced-motion'), '未检测减少动效偏好');
});

/* ---------- CSS 关键类 ---------- */
t('CSS 定义了三级阴影令牌', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('--el-1') && css.includes('--el-2') && css.includes('--el-3'), '缺阴影令牌');
});

t('CSS 定义了品牌渐变', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('--grad-brand'), '缺渐变令牌');
});

t('CSS 有主题切换过渡', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('theme-changing'), '缺主题过渡');
});

t('CSS 有节点键盘导航高亮', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('.node-item.nav-focus'), '缺 nav-focus 样式');
});

t('CSS 有 stagger 错峰动画', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('.stagger'), '缺 stagger');
});

/* ---------- CSS 类与 DOM 的对应 ---------- */
t('热力图 today 类已在实际渲染代码中使用', () => {
  const app = fs.readFileSync(path.join(LS, 'assets/app.js'), 'utf8');
  ok(app.includes("' today'") || app.includes('" today"') || app.includes("'today'"), 'app.js 未生成 today 类');
});

t('polish.css 定义了 .hm-cell.today 样式', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('.hm-cell.today'), 'CSS 缺 today 样式');
});

t('app.js 有空态行动按钮 empty-action', () => {
  const app = fs.readFileSync(path.join(LS, 'assets/app.js'), 'utf8');
  ok(app.includes('empty-action'), '未使用 empty-action');
});

t('polish.css 定义了 .empty-action', () => {
  const css = fs.readFileSync(path.join(LS, 'assets/polish.css'), 'utf8');
  ok(css.includes('.empty-action'), 'CSS 缺 empty-action');
});

/* ---------- Bug 回归 ---------- */
t('回归：题面无 .:: 残留', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'project/bookhub/src/main/java/com/bookhub/sandbox/ProblemBank.java'), 'utf8');
  ok(!src.includes('.::'), '仍存在 .:: 语法错误');
});

t('回归：/challenges 路由存在', () => {
  const app = fs.readFileSync(path.join(LS, 'assets/app.js'), 'utf8');
  ok(app.includes("route('/challenges'"), '缺 /challenges 路由');
});

t('回归：侧栏编程挑战指向 /challenges', () => {
  const app = fs.readFileSync(path.join(LS, 'assets/app.js'), 'utf8');
  ok(app.includes("path: '/challenges'"), '侧栏路径未修正（原为 /practice/ 会 404）');
});

/* ---------- 汇总 ---------- */
console.log('\n  ' + '='.repeat(52));
if (fail === 0) {
  console.log(`  ✅ 全部 ${pass} 项通过`);
  console.log('');
  process.exit(0);
} else {
  console.log(`  ❌ ${fail} 项失败 / 共 ${pass + fail} 项`);
  fails.forEach((f) => console.log(`     · ${f.name}: ${f.msg}`));
  console.log('');
  process.exit(1);
}

/**
 * 判题引擎验证脚本
 * ============================================================
 * 直接测三种情况，确认判题逻辑正确：
 *   ① 错误答案（硬编码返回值）→ 应被隐藏用例抓住
 *   ② 性能关（朴素递归）→ 应超时
 *   ③ 正确解法（迭代）→ 应全通过
 */
const B = 'http://127.0.0.1:8080';

async function judge(problemId, code) {
  const r = await fetch(B + '/api/code/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problemId, code }),
  });
  const j = await r.json();
  return j.data;
}

function report(label, d) {
  console.log(`\n=== ${label} ===`);
  console.log(`  结论   ${d.status}`);
  console.log(`  得分   ${d.passed}/${d.total}  →  ${d.score} 分`);
  console.log(`  摘要   ${d.summary}`);
  if (d.compileError) console.log(`  编译错 ${d.compileError.split('\n')[0]}`);
  const failed = d.cases.filter((c) => !c.passed);
  if (failed.length) {
    failed.slice(0, 3).forEach((c) => {
      console.log(`  失败: ${c.name}`);
      console.log(`        输入=[${String(c.input).replace(/\n/g, '\\n')}]`);
      console.log(`        期望=[${c.expected}]  实际=[${String(c.actual).trim()}]`);
    });
  }
}

const main = async () => {
  // ① 硬编码返回值 —— 示例用例能过，但隐藏用例必须抓住
  let d = await judge('sum-two', 'public static int add(int a, int b) { return 3; }');
  report('错误答案：硬编码 return 3', d);

  // ② 朴素递归 —— 小数值能过，fib(45) 必须超时
  d = await judge('fibonacci',
    'public static long fib(int n) { if (n < 2) return n; return fib(n-1) + fib(n-2); }');
  report('性能关：朴素递归 O(2^n)', d);

  // ③ 迭代 —— 应全通过
  d = await judge('fibonacci', `public static long fib(int n) {
        if (n < 2) return n;
        long a = 0, b = 1;
        for (int i = 2; i <= n; i++) { long t = a + b; a = b; b = t; }
        return b;
    }`);
  report('正确解法：迭代 O(n)', d);

  // ④ 语法错
  d = await judge('sum-two', 'public static int add(int a, int b) { return a + b }');
  report('语法错误：缺分号', d);
};

main().catch((e) => {
  console.error('测试失败：', e.message);
  process.exit(1);
});

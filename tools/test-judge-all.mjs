/**
 * 端到端判题测试（模拟浏览器实际提交）
 * ============================================================
 * 不是测 API，而是测「完整链路」：
 *   题目骨架 → 学习者填写实现 → 提交 → 后端编译运行 → 逐例比对 → 返回结构化结果
 *
 * 每道题都测「错误实现」和「正确实现」两侧，
 * 确认判题器既能拒绝错的、也能接受对的。
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

const cases = [
  {
    id: 'sum-two',
    name: '两数之和',
    wrong: 'public static int add(int a, int b) { return a - b; }',
    right: 'public static int add(int a, int b) { return a + b; }',
  },
  {
    id: 'factorial',
    name: '阶乘',
    wrong: 'public static long factorial(int n) { return n; }',
    right: `public static long factorial(int n) {
        long r = 1;
        for (int i = 2; i <= n; i++) r *= i;
        return r;
    }`,
  },
  {
    id: 'fibonacci',
    name: '斐波那契',
    wrong: 'public static long fib(int n) { return n; }',
    right: `public static long fib(int n) {
        if (n < 2) return n;
        long a = 0, b = 1;
        for (int i = 2; i <= n; i++) { long t = a + b; a = b; b = t; }
        return b;
    }`,
  },
  {
    id: 'array-sum',
    name: '数组求和与最大值',
    wrong: 'public static int[] sumAndMax(int[] arr) { return new int[]{0, 0}; }',
    right: `public static int[] sumAndMax(int[] arr) {
        int sum = 0, max = arr[0];
        for (int v : arr) { sum += v; if (v > max) max = v; }
        return new int[]{sum, max};
    }`,
  },
  {
    id: 'reverse-string',
    name: '字符串反转',
    wrong: 'public static String reverse(String s) { return s; }',
    right: 'public static String reverse(String s) { return new StringBuilder(s).reverse().toString(); }',
  },
  {
    id: 'binary-search',
    name: '二分查找',
    wrong: `public static int search(int[] arr, int target) {
        for (int i = 0; i < arr.length; i++) if (arr[i] == target) return i;
        return -1;
    }`,
    right: `public static int search(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }`,
  },
  {
    id: 'dedupe-sort',
    name: '去重并排序',
    wrong: 'public static int[] dedupeSort(int[] arr) { return arr; }',
    right: `public static int[] dedupeSort(int[] arr) {
        return java.util.Arrays.stream(arr).distinct().sorted().toArray();
    }`,
  },
];

const main = async () => {
  console.log('\n' + '='.repeat(64));
  console.log('  端到端判题测试：7 道题 × (错误实现 + 正确实现)');
  console.log('='.repeat(64));

  let allGood = true;

  for (const c of cases) {
    process.stdout.write(`\n【${c.name}】`);

    // --- 错误实现：必须被判错 ---
    const w = await judge(c.id, c.wrong);
    const wrongOk = w.status !== 'PASS' && w.score < 100;
    process.stdout.write(`\n  错误实现 → ${w.status}  ${w.score}分  `);
    process.stdout.write(wrongOk ? '✓ 正确拒绝' : '✗ 竟然通过了！');
    if (!wrongOk) allGood = false;

    // --- 正确实现：必须满分 ---
    const r = await judge(c.id, c.right);
    const rightOk = r.status === 'PASS' && r.score === 100;
    process.stdout.write(`\n  正确实现 → ${r.status}  ${r.score}分  `);
    process.stdout.write(rightOk ? '✓ 正确接受' : '✗ 误判！');
    if (!rightOk) {
      allGood = false;
      r.cases.filter((x) => !x.passed).forEach((x) => {
        console.log(`\n     失败用例: ${x.name}`);
        console.log(`       输入=${JSON.stringify(x.input)} 期望=[${x.expected}] 实际=[${String(x.actual).trim()}]`);
      });
    }
    console.log('');
  }

  console.log('\n' + '='.repeat(64));
  console.log(allGood ? '  ✓ 全部 14 项判定正确' : '  ✗ 存在误判，需检查题库或判题引擎');
  console.log('='.repeat(64) + '\n');

  process.exit(allGood ? 0 : 1);
};

main().catch((e) => {
  console.error('测试异常：', e);
  process.exit(1);
});

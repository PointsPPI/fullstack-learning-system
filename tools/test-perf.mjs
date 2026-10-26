/**
 * 性能护栏标定 —— 实测 O(n) 与 O(log n) 的真实耗时差
 * ============================================================
 * 目的：确定超时阈值应该设多少，才能可靠区分两种实现。
 *
 * 为什么需要标定而不是"拍脑袋设 3 秒"？
 *   前面设 3 秒失败了两次：
 *     50 万数组 + 1 次查询 → 线性扫描只花几毫秒
 *     20 万查询 × 20 万数组 → 理论上该超时，但实测还是过了
 *   必须实测才能知道真实数字。
 */
const B = 'http://127.0.0.1:8080';

async function judge(problemId, code) {
  const r = await fetch(B + '/api/code/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problemId, code }),
  });
  return (await r.json()).data;
}

const LINEAR = `public static int search(int[] arr, int target) {
    for (int i = 0; i < arr.length; i++) if (arr[i] == target) return i;
    return -1;
}`;

const BINARY = `public static int search(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`;

const main = async () => {
  for (const [name, code] of [['线性扫描 O(n)', LINEAR], ['二分查找 O(log n)', BINARY]]) {
    const t0 = Date.now();
    const d = await judge('binary-search', code);
    const wall = Date.now() - t0;

    console.log(`\n【${name}】`);
    console.log(`  结论      ${d.status}`);
    console.log(`  得分      ${d.passed}/${d.total} (${d.score}分)`);
    console.log(`  总耗时    ${d.durationMs}ms  (含编译+全部用例)`);
    console.log(`  墙钟      ${wall}ms`);

    // 找性能用例的耗时
    const perf = d.cases.find((c) => c.name.includes('性能护栏'));
    if (perf) {
      console.log(`  性能用例  ${perf.status}  ${perf.durationMs}ms`);
    }
    const failed = d.cases.filter((c) => !c.passed);
    if (failed.length) {
      console.log(`  失败用例: ${failed.map((c) => c.name + '(' + c.durationMs + 'ms)').join(', ')}`);
    }
  }
};

main().catch(console.error);

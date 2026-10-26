/**
 * 性能护栏标定 v2 —— 找到能真正分离 O(n) 与 O(log n) 的规模
 * ============================================================
 * 前面的尝试都失败了，原因总结：
 *   ① 50 万数组 + 1 次查询：线性只要几毫秒（Java 数组遍历太快）
 *   ② 20 万查询 × 20 万元素：二分 1019ms / 线性 5346ms，差 5 倍，
 *      但固定开销（JVM 启动 600ms + 读入 20 万数字）占了很大比重，
 *      导致阈值窗口很窄，慢机器上容易误杀。
 *   ③ 10 万 × 10 万：二分 1069ms / 线性 2063ms，只差 2 倍 —— 更糟。
 *
 * 本脚本直接测多个规模，找出「二分远快、线性远慢」的最佳组合。
 */
const B = 'http://127.0.0.1:8080';

async function runRaw(code, stdin, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(B + '/api/code/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, stdin, timeoutMs }),
  });
  const d = (await r.json()).data;
  return { ...d, wall: Date.now() - t0 };
}

/** 构造 n 个元素、q 次查询的输入 */
function buildInput(n, q) {
  const parts = [String(n)];
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(i);
  parts.push(arr.join(' '));
  parts.push(String(q));
  const qs = [];
  for (let k = 0; k < q; k++) {
    qs.push([0, Math.floor(n / 2), n - 1, n + 1][k % 4]);
  }
  parts.push(qs.join(' '));
  return parts.join('\n');
}

const BINARY = `import java.util.*;
public class Main {
    static int search(int[] arr, int t) {
        int l = 0, r = arr.length - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (arr[m] == t) return m;
            if (arr[m] < t) l = m + 1; else r = m - 1;
        }
        return -1;
    }
    public static void main(String[] a) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = sc.nextInt();
        int q = sc.nextInt();
        long sum = 0;
        for (int k = 0; k < q; k++) sum += search(arr, sc.nextInt());
        System.out.println(sum);
    }
}`;

const LINEAR = BINARY.replace(
  `        int l = 0, r = arr.length - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (arr[m] == t) return m;
            if (arr[m] < t) l = m + 1; else r = m - 1;
        }
        return -1;`,
  `        for (int i = 0; i < arr.length; i++) if (arr[i] == t) return i;
        return -1;`
);

const scenarios = [
  { n: 100000, q: 100000 },
  { n: 200000, q: 200000 },
  { n: 300000, q: 300000 },
  { n: 1000000, q: 20000 },
];

const main = async () => {
  console.log('\n' + '='.repeat(72));
  console.log('  规模标定：找出能分离 O(n) 与 O(log n) 的最佳组合');
  console.log('='.repeat(72));
  console.log('\n  规模(n数组×q查询)    二分耗时    线性耗时    倍数    超时(20s)');
  console.log('  ' + '-'.repeat(68));

  for (const s of scenarios) {
    const input = buildInput(s.n, s.q);
    const [b, l] = await Promise.all([
      runRaw(BINARY, input, 20000),
      runRaw(LINEAR, input, 20000),
    ]);
    const ratio = l.durationMs && b.durationMs ? (l.durationMs / b.durationMs).toFixed(1) : '-';
    const mark = (x) => (x.status === 'TIMEOUT' ? '超时' : '完成');
    console.log(
      `  ${String(s.n).padStart(7)} × ${String(s.q).padStart(7)}  ` +
      `${String(b.durationMs).padStart(8)}ms  ${String(l.durationMs).padStart(8)}ms  ` +
      `${String(ratio).padStart(5)}x   ` +
      `${mark(b)}/${mark(l)}`
    );
  }

  console.log('\n  说明：');
  console.log('    · "倍数" = 线性耗时 / 二分耗时。倍数越大，阈值窗口越宽、越稳。');
  console.log('    · 若两者都被判"超时"，说明规模过大（连二分都跑不完）。');
  console.log('    · 目标：找到一个规模，二分 <1.5s、线性 >6s，倍数 >4。');
};

main().catch(console.error);

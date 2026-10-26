/**
 * 时序分解 —— 找出 2500ms 超时为何没拦住线性扫描
 * ============================================================
 * 假设：waitFor(timeoutMs) 是从进程启动开始算的，
 *       而 JVM 启动本身就吃掉 1~2 秒，
 *       真正留给用户代码的计算时间只剩几百毫秒。
 *
 * 验证方法：用一段「明确要跑 N 毫秒」的代码，
 * 看它在不同 timeout 下是被杀掉还是跑完。
 */
const B = 'http://127.0.0.1:8080';

async function run(code, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(B + '/api/code/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, timeoutMs }),
  });
  const d = (await r.json()).data;
  return { ...d, wall: Date.now() - t0 };
}

const busy = (ms) => `public class Main {
    public static void main(String[] a) {
        long t0 = System.nanoTime();
        while ((System.nanoTime() - t0) / 1_000_000 < ${ms}) { }
        System.out.println("done");
    }
}`;

const main = async () => {
  console.log('\n=== 基线：空程序（纯 JVM 启动开销）===');
  let r = await run('public class Main { public static void main(String[] a) { System.out.println("x"); } }', 10000);
  console.log(`  服务端耗时 ${r.durationMs}ms   状态 ${r.status}`);

  console.log('\n=== 忙等 500ms，超时设 3000ms（应通过）===');
  r = await run(busy(500), 3000);
  console.log(`  服务端耗时 ${r.durationMs}ms   状态 ${r.status}   输出 ${JSON.stringify(r.stdout.trim())}`);

  console.log('\n=== 忙等 2000ms，超时设 3000ms（应通过？）===');
  r = await run(busy(2000), 3000);
  console.log(`  服务端耗时 ${r.durationMs}ms   状态 ${r.status}   输出 ${JSON.stringify(r.stdout.trim())}`);

  console.log('\n=== 忙等 4000ms，超时设 3000ms（应超时）===');
  r = await run(busy(4000), 3000);
  console.log(`  服务端耗时 ${r.durationMs}ms   状态 ${r.status}`);

  console.log('\n=== 忙等 4000ms，超时设 2500ms（应超时）===');
  r = await run(busy(4000), 2500);
  console.log(`  服务端耗时 ${r.durationMs}ms   状态 ${r.status}`);

  console.log('\n结论：如果"忙等 2000ms + 超时 3000ms"能通过，');
  console.log('      而"忙等 4000ms + 超时 3000ms"超时，说明');
  console.log('      超时是从进程启动算起的 —— JVM 启动约占用 (3000 - 2000 + 余量)。');
};

main().catch(console.error);

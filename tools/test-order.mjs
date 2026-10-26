/**
 * 限流与幂等的执行顺序验证
 * ============================================================
 * 疑问：26 次请求，Redis 计数器只记录了 17 次。
 *
 * 可能原因：
 *   A) 幂等切面在限流切面**之前**执行 → 被幂等拦下的请求根本没走到限流
 *   B) 计数器在测试期间过期重置
 *   C) 限流切面没生效
 *
 * 验证方法：发一串**必然被幂等拒绝**的相同请求，
 * 看计数器有没有增长。如果没增长 → 说明幂等在前，限流在后。
 */
const B = 'http://127.0.0.1:8080';
import { execSync } from 'node:child_process';

const redisCli = (cmd) => {
  try {
    return execSync(`tools\\redis\\redis-cli.exe -p 6380 ${cmd}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const post = async (path, body) => {
  const r = await fetch(B + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
};

const main = async () => {
  const key = 'rate:borrow:ip:127.0.0.1';

  // 清空计数器，从 0 开始观察
  redisCli(`del ${key}`);
  console.log('\n=== 观察：被幂等拒绝的请求，是否会计入限流计数器 ===\n');

  console.log(`初始计数器: ${redisCli(`get ${key}`) || '(nil)'}`);

  // 发 5 次完全相同的请求 → 第 1 次成功，后 4 次被幂等拒绝
  const sameBody = { readerId: 1 };
  const results = [];
  for (let i = 0; i < 5; i++) {
    const r = await post('/api/books/2/borrow', sameBody);
    results.push(r.code);
  }

  console.log(`5 次相同请求的业务码: [${results.join(', ')}]`);
  console.log(`  预期: 第 1 个 0 或业务错误，后 4 个 10502（幂等）`);
  console.log(`计数器变化: ${redisCli(`get ${key}`) || '(nil)'}`);

  const after = Number(redisCli(`get ${key}`) || 0);
  console.log('');
  if (after >= 5) {
    console.log(`  → 计数器 = ${after}（5 次都计入）→ 限流切面在幂等**之前** ✓`);
  } else if (after <= 2) {
    console.log(`  → 计数器 = ${after}（只有 1~2 次计入）→ 幂等在限流**之前**`);
    console.log(`     这意味着：被幂等拦下的请求不会消耗限流额度。`);
    console.log(`     优缺点：`);
    console.log(`       ✓ 优点：正常用户双击不会白耗限流额度`);
    console.log(`       ✗ 缺点：恶意刷接口若每次都换参数，能绕过"幂等"直接打限流，`);
    console.log(`              而限流额度是共享的 → 正常用户可能被牵连`);
    console.log(`     若要严格防刷，应让限流在最外层（用 @Order 控制切面顺序）。`);
  } else {
    console.log(`  → 计数器 = ${after}，无法从本次测试判断顺序（可能已过期）`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

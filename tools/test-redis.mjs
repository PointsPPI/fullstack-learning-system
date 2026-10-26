/**
 * Redis 并发控制验证
 * ============================================================
 * 三个测试，分别验证三层防护是否真的生效：
 *   ① 缓存      —— 连续两次查同一本书，第二次应走 Redis（不查库）
 *   ② 幂等      —— 3 秒内相同请求发两次，第二次应被拒
 *   ③ 分布式锁  —— 10 个并发借同一本书，最终只有 1 个成功
 */
const B = 'http://127.0.0.1:8080';

const post = async (path, body) => {
  const r = await fetch(B + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json() };
};
const get = async (path) => {
  const r = await fetch(B + path);
  return { status: r.status, json: await r.json() };
};

const main = async () => {
  /* ---------- ① 缓存 ---------- */
  console.log('\n=== ① 缓存：连续查两次同一本书 ===');
  const t1 = Date.now();
  const a = await get('/api/books/1');
  const first = Date.now() - t1;

  const t2 = Date.now();
  const b = await get('/api/books/1');
  const second = Date.now() - t2;

  console.log(`  第一次  ${first}ms   title=${a.json.data?.title}`);
  console.log(`  第二次  ${second}ms   title=${b.json.data?.title}`);
  console.log(`  两次内容一致: ${JSON.stringify(a.json.data) === JSON.stringify(b.json.data)}`);
  console.log(`  → 第二次应明显更快（走 Redis 而不是 MySQL）`);

  /* ---------- ② 幂等 ---------- */
  console.log('\n=== ② 幂等：3 秒内重复提交同一请求 ===');
  const borrowBody = { readerId: 3 };
  const r1 = await post('/api/books/5/borrow', borrowBody);
  console.log(`  第 1 次  code=${r1.json.code}  ${r1.json.message}`);

  const r2 = await post('/api/books/5/borrow', borrowBody);
  console.log(`  第 2 次  code=${r2.json.code}  ${r2.json.message}`);
  console.log(`  → 第 2 次应被拒绝（code 10502）`);

  /* ---------- ③ 分布式锁 + 库存 ---------- */
  console.log('\n=== ③ 并发：10 个请求同时借同一本书 ===');

  // 先看一下书 7 当前库存
  const before = await get('/api/books/7');
  console.log(`  借前库存: ${before.json.data?.stock}`);

  // 10 个不同读者 id 同时借（用不同 readerId 绕过幂等，专测锁与库存）
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      post('/api/books/7/borrow', { readerId: (i % 4) + 1 })
    )
  );

  const codes = results.map((r) => r.json.code);
  const ok = codes.filter((c) => c === 0).length;
  const reasons = {};
  results.forEach((r) => {
    if (r.json.code !== 0) reasons[r.json.code] = r.json.message;
  });

  console.log(`  成功 ${ok} 个，失败 ${10 - ok} 个`);
  Object.entries(reasons).forEach(([c, m]) => console.log(`    code ${c}: ${m}`));

  const after = await get('/api/books/7');
  console.log(`  借后库存: ${after.json.data?.stock}`);
  console.log(`  → 库存不应变负数；成功数应等于库存减少量`);

  /* ---------- ④ 限流 ---------- */
  console.log('\n=== ④ 限流：快速打 25 次借书接口（限 20 次/分钟）===');
  let limited = 0;
  let other = 0;
  for (let i = 0; i < 25; i++) {
    const r = await post('/api/books/1/borrow', { readerId: 2 });
    if (r.json.code === 10501) limited++;
    else other++;
  }
  console.log(`  被限流 ${limited} 次，其他结果 ${other} 次`);
  console.log(`  → 应有约 5 次被限流（第 21~25 次）`);
};

main().catch((e) => {
  console.error('测试失败：', e.message);
  process.exit(1);
});

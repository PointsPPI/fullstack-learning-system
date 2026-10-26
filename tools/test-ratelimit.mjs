/**
 * 限流验证（修正版）
 * ============================================================
 * 上一版测试有缺陷：借书接口同时有幂等（3 秒）和限流（60 秒 20 次）。
 * 快速连发 25 次时，前几次成功后，后面的全被「幂等」拦下，
 * 根本走不到限流那一层 —— 所以测不出限流。
 *
 * 正确做法：用**不同的参数**绕过幂等，只让限流生效。
 * 幂等 key 包含参数哈希，参数不同 → key 不同 → 不被幂等拦截。
 */
const B = 'http://127.0.0.1:8080';

const post = async (path, body) => {
  const r = await fetch(B + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await r.json());
};

const main = async () => {
  console.log('\n=== 限流测试：20 次/分钟，发 26 次（每次参数不同绕过幂等）===');

  let limited = 0;
  let passed = 0;
  const codes = {};

  for (let i = 0; i < 26; i++) {
    // 每次用不同 readerId + 不同书，确保幂等 key 不同
    const bookId = 1 + (i % 12);
    const readerId = 1 + (i % 4);
    const r = await post(`/api/books/${bookId}/borrow`, { readerId });
    codes[r.code] = (codes[r.code] || 0) + 1;
    if (r.code === 10501) limited++;
    else passed++;
  }

  console.log(`  通过 ${passed} 次，被限流 ${limited} 次`);
  console.log(`  各业务码分布：`, codes);
  console.log(`  预期：前 20 次放行（可能有些因库存/上限失败），第 21 次起 code=10501`);

  if (limited > 0) {
    console.log('\n  ✓ 限流生效');
  } else {
    console.log('\n  ✗ 限流未触发 —— 检查 @RateLimit 注解是否真的加上了');
  }
};

main().catch((e) => {
  console.error('测试失败：', e.message);
  process.exit(1);
});

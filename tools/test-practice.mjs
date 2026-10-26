/**
 * 练习场与判题的端到端验证
 * ============================================================
 * 不只是测 API，而是模拟前端的完整调用序列：
 *   ① 加载题目列表 → ② 加载题目详情 → ③ 提交判题 → ④ 看结果结构
 * 并验证前端会用到的每个字段是否齐全。
 */
const B = 'http://127.0.0.1:8080';

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}  ${detail || ''}`); }
}

async function j(path, opts) {
  const r = await fetch(B + path, opts);
  return { status: r.status, json: await r.json() };
}

(async () => {
  console.log('\n  练习场端到端验证\n  ' + '='.repeat(52) + '\n');

  /* ---------- ① 题目列表 ---------- */
  console.log('  【题目列表】');
  const list = await j('/api/code/problems');
  t('接口返回 200', list.status === 200);
  t('code = 0', list.json.code === 0);
  t('题目数 = 7', list.json.data.length === 7, `实际 ${list.json.data.length}`);

  const first = list.json.data[0];
  t('每项有 id/title/difficulty', !!(first.id && first.title && first.difficulty));
  t('每项有 caseCount', typeof first.caseCount === 'number');
  t('每项有 tags', Array.isArray(first.tags));

  /* ---------- ② 题目详情 ---------- */
  console.log('\n  【题目详情】');
  const det = await j('/api/code/problems/binary-search');
  t('接口返回 200', det.status === 200);
  const d = det.json.data;
  t('有 description', !!d.description);
  t('有 skeleton（骨架代码）', !!d.skeleton);
  t('有 methodSignature', !!d.methodSignature);
  t('有 caseCount', d.caseCount === 9, `实际 ${d.caseCount}`);
  t('有 samples（示例用例）', Array.isArray(d.samples) && d.samples.length === 1);
  t('示例含 input/expected', !!(d.samples[0].input && d.samples[0].expected !== undefined));
  t('题面无 .:: 残留', !d.description.includes('.::'));

  /* ---------- ③ 判题：正确 ---------- */
  console.log('\n  【判题 · 正确实现】');
  const right = await j('/api/code/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemId: 'binary-search',
      code: `public static int search(int[] arr, int target) {
        int l = 0, r = arr.length - 1;
        while (l <= r) {
          int m = l + (r - l) / 2;
          if (arr[m] == target) return m;
          if (arr[m] < target) l = m + 1; else r = m - 1;
        }
        return -1;
      }`,
    }),
  });
  const rd = right.json.data;
  t('status = PASS', rd.status === 'PASS', rd.status);
  t('score = 100', rd.score === 100, `实际 ${rd.score}`);
  t('passed = total', rd.passed === rd.total);
  t('有 cases 数组', Array.isArray(rd.cases) && rd.cases.length === 9);
  t('每个 case 有 name/passed/status', rd.cases.every(c => c.name && typeof c.passed === 'boolean' && c.status));
  t('通过的 case 不暴露 expected', rd.cases.filter(c => c.passed).every(c => c.expected === '（通过）'));
  t('summary 有内容', !!rd.summary);

  /* ---------- ④ 判题：错误 ---------- */
  console.log('\n  【判题 · 错误实现】');
  const wrong = await j('/api/code/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemId: 'binary-search',
      code: 'public static int search(int[] arr, int target) { return -99; }',
    }),
  });
  const wd = wrong.json.data;
  t('status 不是 PASS', wd.status !== 'PASS', wd.status);
  t('score < 100', wd.score < 100, `实际 ${wd.score}`);
  t('有失败用例', wd.cases.some(c => !c.passed));
  const failedCase = wd.cases.find(c => !c.passed);
  t('失败用例暴露 expected', !!failedCase.expected && failedCase.expected !== '（通过）');
  t('失败用例暴露 actual', failedCase.actual !== undefined);

  /* ---------- ⑤ 自由运行 ---------- */
  console.log('\n  【自由运行】');
  const run = await j('/api/code/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'public class Main { public static void main(String[] a){ System.out.print("Hello"); } }',
    }),
  });
  t('status = PASS', run.json.data.status === 'PASS');
  t('stdout = Hello', run.json.data.stdout.trim() === 'Hello', run.json.data.stdout);
  t('有 durationMs', typeof run.json.data.durationMs === 'number');
  t('有 ok 布尔', typeof run.json.data.ok === 'boolean');

  /* ---------- ⑥ 语法检查 ---------- */
  console.log('\n  【语法检查】');
  const chk = await j('/api/code/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'public class Main { void f() { int x = "s"; } }' }),
  });
  t('status = COMPILE_ERROR', chk.json.data.status === 'COMPILE_ERROR');
  t('有 compileError 内容', !!chk.json.data.compileError);
  t('compileError 无乱码（英文）', /error:/.test(chk.json.data.compileError));

  console.log('\n  ' + '='.repeat(52));
  console.log(fail === 0 ? `  ✅ 全部 ${pass} 项通过` : `  ❌ ${fail} 项失败 / 共 ${pass + fail} 项`);
  console.log('');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });

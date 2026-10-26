package com.bookhub.sandbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 判题引擎 —— 把"用户代码"和"测试用例"组装成可执行程序，逐例比对输出。
 *
 * <pre>
 * ══════════════════════════════════════════════════════════════
 *  判题的核心机制：代码拼接（harness 注入）
 * ══════════════════════════════════════════════════════════════
 *
 * 学习者在网页上写的通常只是"一个方法"，而不是完整可运行的程序。
 * 例如题目要求实现：
 *
 *     public static int add(int a, int b) { return a + b; }
 *
 * 但 javac 需要一个完整的 class 才能编译。
 *
 * 所以判题时把用户代码**嵌进一个自动生成的骨架**：
 *
 *     import java.util.*;                          ← 骨架提供的 import
 *     public class Main {
 *         // ═══ 用户代码开始 ═══
 *         public static int add(int a, int b) {
 *             return a + b;
 *         }
 *         // ═══ 用户代码结束 ═══
 *         public static void main(String[] args) {   ← 骨架提供的测试驱动
 *             Scanner sc = new Scanner(System.in);
 *             int a = sc.nextInt();
 *             int b = sc.nextInt();
 *             System.out.println(add(a, b));
 *         }
 *     }
 *
 * 这个 main 方法就是"测试驱动"（harness）。
 * 不同题目配不同的 harness（单组输入 / 多组输入 / 数组输入 ...）。
 *
 *   ⚠️ 关键设计：用户代码只负责"实现方法"，不负责处理输入输出。
 *     · 好处：学习者专注算法，不用每次写 Scanner
 *     · 坏处：无法出"从 stdin 读数据"这类题
 *     两种题型都有价值，所以本引擎支持两种模式：
 *        Mode.METHOD     用户只写方法，骨架提供 main
 *        Mode.FULL       用户写完整程序（自己处理输入输出），骨架只做包装
 * ══════════════════════════════════════════════════════════════
 * </pre>
 */
@Service
public class JudgeService {

    private static final Logger log = LoggerFactory.getLogger(JudgeService.class);

    private final JavaSandbox sandbox;

    public JudgeService(JavaSandbox sandbox) {
        this.sandbox = sandbox;
    }

    /** 判题模式 */
    public enum Mode {
        /** 用户只实现方法；骨架提供 main 与输入读取 */
        METHOD,
        /** 用户写完整程序（含 main）；骨架只负责包成 Main 类 */
        FULL
    }

    /** 单个测试用例 */
    public record TestCase(String name, String input, String expected) { }

    /**
     * 执行判题。
     *
     * @param userCode  用户提交的代码片段
     * @param harness   测试驱动（骨架的 main 方法体，Mode.METHOD 时使用）
     * @param imports   需要预置的 import 语句
     * @param cases     测试用例列表
     * @param mode      判题模式
     * @param timeoutMs 每例超时
     */
    public JudgeResult judge(String userCode, String harness, String imports,
                             List<TestCase> cases, Mode mode, long timeoutMs) {

        long t0 = System.currentTimeMillis();

        if (cases == null || cases.isEmpty()) {
            return new JudgeResult(ExecResult.Status.SYSTEM_ERROR, 0, 0, 0,
                    List.of(), null, 0, "题目缺少测试用例，无法判题");
        }

        String fullCode = assemble(userCode, harness, imports, mode);

        // ① 先编译一次（编译不过就不用逐例跑了，省时间）
        ExecResult compileCheck = sandbox.compileOnly(fullCode);
        if (compileCheck.status() == ExecResult.Status.COMPILE_ERROR) {
            return JudgeResult.compileFailure(compileCheck.compileError(),
                    System.currentTimeMillis() - t0, cases.size());
        }
        if (compileCheck.status() == ExecResult.Status.SYSTEM_ERROR) {
            return new JudgeResult(ExecResult.Status.SYSTEM_ERROR, 0, cases.size(), 0,
                    List.of(), compileCheck.stderr(), System.currentTimeMillis() - t0,
                    "评测系统异常：" + compileCheck.stderr());
        }

        // ② 逐例运行
        List<JudgeResult.CaseResult> results = new ArrayList<>();
        int passed = 0;
        boolean anyTimeout = false;
        String firstRuntimeErr = null;

        for (TestCase c : cases) {
            ExecResult r = sandbox.compileAndRun(fullCode, c.input(), timeoutMs);

            boolean ok = false;
            String msg = null;

            if (r.status() == ExecResult.Status.PASS) {
                String actual = normalize(r.stdout());
                String expected = normalize(c.expected());
                if (actual.equals(expected)) {
                    ok = true;
                } else {
                    msg = "输出不符";
                }
                results.add(new JudgeResult.CaseResult(
                        c.name(), c.input(), c.expected(), r.stdout(),
                        ok ? ExecResult.Status.PASS : ExecResult.Status.WRONG_ANSWER,
                        msg, r.durationMs()));
                if (ok) passed++;
                continue;
            }

            // 编译已在上面统一处理过，这里剩下的是运行期问题
            if (r.status() == ExecResult.Status.TIMEOUT) anyTimeout = true;
            if (r.status() == ExecResult.Status.RUNTIME_ERROR && firstRuntimeErr == null) {
                firstRuntimeErr = r.stderr();
            }

            results.add(new JudgeResult.CaseResult(
                    c.name(), c.input(), c.expected(), r.stdout(),
                    r.status(),
                    r.stderr() != null ? r.stderr() : r.summary(),
                    r.durationMs()));
        }

        long dur = System.currentTimeMillis() - t0;
        int total = cases.size();
        int score = Math.round(passed * 100f / total);

        ExecResult.Status overall = passed == total
                ? ExecResult.Status.PASS
                : anyTimeout ? ExecResult.Status.TIMEOUT
                : firstRuntimeErr != null ? ExecResult.Status.RUNTIME_ERROR
                : ExecResult.Status.WRONG_ANSWER;

        String summary = buildSummary(overall, passed, total, anyTimeout, firstRuntimeErr);

        return new JudgeResult(overall, passed, total, score, results, null, dur, summary);
    }

    /* ============================================================
     * 代码组装
     * ============================================================ */

    private String assemble(String userCode, String harness, String imports, Mode mode) {
        StringBuilder sb = new StringBuilder();

        // ① 预置 import（骨架用到的工具类）
        String imps = imports == null || imports.isBlank()
                ? "import java.util.*;"
                : imports;
        sb.append(imps).append("\n\n");

        // ② 类声明
        sb.append("public class Main {\n\n");

        // ③ 用户代码
        sb.append("    // ==================== 你的代码 ====================\n");
        sb.append(indent(userCode, "    "));
        sb.append("\n    // ==================== 代码结束 ====================\n\n");

        // ④ 测试驱动
        if (mode == Mode.METHOD) {
            sb.append("    public static void main(String[] args) throws Exception {\n");
            sb.append(indent(harness == null ? "" : harness, "        "));
            sb.append("\n    }\n");
        } else {
            // FULL 模式：用户已经写了 main，不需要再包
            // 但如果用户写的不是 public class Main，需要把用户代码原样放进来
            // （这里的 assemble 已假设用户代码在 class Main 内部）
        }

        sb.append("}\n");
        return sb.toString();
    }

    /** 给每行加缩进，保持代码块的可读性（也便于前端展示报错行号对应关系） */
    private String indent(String code, String pad) {
        if (code == null || code.isBlank()) return pad;
        return pad + code.strip().replace("\n", "\n" + pad);
    }

    /**
     * 输出归一化 —— 判题最容易踩的坑。
     *
     * <pre>
     * 为什么要归一化？
     *   学习者输出 "6" 和 "6 " 和 "6\n\n" 在语义上是同一个答案，
     *   但字符串比较会判错，导致"我明明对的说我错"。
     *
     * 归一化做的事：
     *   ① 换行统一为 \n（Windows 的 \r\n 与 Linux 的 \n）
     *   ② 去掉行尾空白（行内空格保留，因为可能是格式要求的一部分）
     *   ③ 去掉末尾空行
     *   ④ 去掉首尾整体空白
     *
     * 注意：**不**去掉行内空格、**不**做大小写转换 ——
     * 那些属于题目本身的判定规则，应由题目作者决定。
     * </pre>
     */
    private String normalize(String s) {
        if (s == null) return "";
        return s.replace("\r\n", "\n")
                .replace("\r", "\n")
                .replaceAll("(?m)[ \\t]+$", "")   // 行尾空白
                .replaceAll("\n+$", "")           // 末尾空行
                .strip();
    }

    private String buildSummary(ExecResult.Status st, int passed, int total,
                                boolean timeout, String runtimeErr) {
        if (st == ExecResult.Status.PASS) {
            return String.format("全部 %d 个测试通过 ✓", total);
        }
        if (timeout) {
            return String.format("通过 %d/%d。存在超时的用例 —— 检查是否有死循环或过深递归", passed, total);
        }
        if (runtimeErr != null) {
            String firstLine = runtimeErr.split("\n")[0];
            return String.format("通过 %d/%d。运行出错：%s", passed, total, firstLine);
        }
        return String.format("通过 %d/%d。检查输出格式（空格、换行、大小写）是否与预期一致", passed, total);
    }
}

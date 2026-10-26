package com.bookhub.sandbox;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 题库 —— 编程题定义（含隐藏测试用例）。
 *
 * <pre>
 * 每道题包含：
 *   skeleton  学习者看到的初始代码（含方法签名与 TODO 注释）
 *   harness   测试驱动（骨架 main 的方法体，决定"怎么读输入、怎么输出"）
 *   imports   预置 import
 *   cases     测试用例（含隐藏用例）
 *   hint      提示
 *
 * ────────────────────────────────────────────────────────────
 *  出题设计的三条原则（这决定了题目好不好用）
 * ────────────────────────────────────────────────────────────
 *
 * ① 用例要覆盖边界，而不只是"正常情况"
 *    只测 add(1,2)==3 是无效的 —— 学习者写 return 3 就能骗过去。
 *    必须有：正常值、边界值（0、负数、空集合）、极端值（大数、长串）。
 *
 * ② 隐藏用例必须和示例不同
 *    示例用例给了答案，隐藏用例才是真正的判分依据。
 *    本类用 limit(1) 暴露第一个用例作示例，其余全隐藏。
 *
 * ③ 每道题都要有"能立刻验证对错"的输入输出
 *    不要出"设计一个架构"这种无法自动判的题 —— 那种适合人工评审。
 *    自动判题只适合**输入→输出确定**的题。
 * </pre>
 */
@Component
public class ProblemBank {

    /**
     * 一道编程题。
     *
     * @param id           唯一标识
     * @param title        标题
     * @param difficulty   难度：入门 / 简单 / 中等
     * @param tags         知识点标签
     * @param topicKey     关联的学习主题（如 "web-frontend/javascript"）
     * @param description  题目描述（Markdown）
     * @param skeleton     学习者看到的初始代码
     * @param methodSignature 要求实现的方法签名（用于提示）
     * @param hint         提示
     * @param imports      预置 import
     * @param harness      测试驱动（main 方法体）
     * @param cases        测试用例
     * @param mode         判题模式
     * @param timeoutMs    单例超时
     */
    public record Problem(
            String id,
            String title,
            String difficulty,
            List<String> tags,
            String topicKey,
            String description,
            String skeleton,
            String methodSignature,
            String hint,
            String imports,
            String harness,
            List<JudgeService.TestCase> cases,
            JudgeService.Mode mode,
            Long timeoutMs
    ) { }

    private final Map<String, Problem> bank = new LinkedHashMap<>();

    public ProblemBank() {
        register();
    }

    public Problem get(String id) {
        return bank.get(id);
    }

    public List<Problem> list() {
        return List.copyOf(bank.values());
    }

    private void add(Problem p) {
        bank.put(p.id(), p);
    }

    /**
     * 生成大规模二分查找用例：n 个连续整数 0..n-1，查找最后一个。
     *
     * <pre>
     * 为什么需要「规模关」？
     *   只测小数组时，一个 O(n) 的线性扫描也能全过 ——
     *   但它不是二分查找，不符合题目要求。
     *
     *   加入 50 万元素后：
     *     · 二分查找：约 19 次比较，瞬间完成
     *     · 线性扫描：50 万次比较 + 50 万次数组访问
     *
     *   更严格的方案是限制指令数（需要 JVM 插桩），
     *   在「进程级沙箱」的能力范围内，规模关是性价比最高的手段。
     * </pre>
     */
    /**
     * 生成二分查找的「性能护栏」用例。
     *
     * <pre>
     * ══════════════════════════════════════════════════════════════
     *  为什么"大数组 + 单次查询"测不出算法差异？
     * ══════════════════════════════════════════════════════════════
     *
     * 一开始我给的是"50 万元素、查 1 次"：
     *   · 线性扫描 50 万次 ≈ 几毫秒（Java 数组遍历极快）
     *   · 5 秒超时根本拦不住它
     *   → 一个 O(n) 的错误实现拿了满分
     *
     * 问题在于：**单次查询时，O(n) 的常数本身就不大**。
     * 要知道 50 万次数组访问在现代 CPU 上只要 1~2 毫秒。
     *
     * ══════════════════════════════════════════════════════════════
     *  正确做法：放大「查询次数」
     * ══════════════════════════════════════════════════════════════
     *
     * 当查询次数 q 也达到 20 万时：
     *   二分：q × log₂(n) = 200,000 × 18   ≈ 360 万次比较   → 几十毫秒 ✓
     *   线性：q × n/2    = 200,000 × 100,000 ≈ 200 亿次比较 → 必然超时 ✗
     *
     * 差距从"毫秒级"变成"三个数量级"，超时才拦得住。
     *
     * 这是算法题判题的一个通用技巧：
     *   想区分复杂度，不能只放大输入规模，要放大「规模 × 调用次数」。
     * </pre>
     *
     * @param n 数组长度
     * @param q 查询次数
     */
    private String buildPerfCase(int n, int q) {
        StringBuilder sb = new StringBuilder(n * 7 + q * 7);
        // ① 数组：0, 1, 2, ..., n-1
        sb.append(n).append('\n');
        for (int i = 0; i < n; i++) {
            sb.append(i);
            sb.append(i == n - 1 ? '\n' : ' ');
        }
        // ② 查询次数
        sb.append(q).append('\n');
        // ③ 查询内容：轮流查首、中、尾、以及一些不存在的位置
        //    这样既覆盖命中/不命中，又保证每次都要真正搜索（不能被短路）
        for (int k = 0; k < q; k++) {
            int target;
            switch (k % 4) {
                case 0 -> target = 0;              // 首元素
                case 1 -> target = n / 2;          // 中元素
                case 2 -> target = n - 1;          // 尾元素
                default -> target = n + 1;         // 不存在（最大）
            }
            sb.append(target);
            sb.append(k == q - 1 ? '\n' : ' ');
        }
        // ④ 期望输出：一个校验和（所有查询结果之和）
        long sum = 0;
        for (int k = 0; k < q; k++) {
            sum += switch (k % 4) {
                case 0 -> 0;
                case 1 -> n / 2;
                case 2 -> n - 1;
                default -> -1;
            };
        }
        // 用 "输入|||期望" 编码，由 perfCase 拆分
        return sb.toString().trim() + "|||" + sum;
    }

    /**
     * 构造性能用例（把 buildPerfCase 的返回拆成 input / expected）。
     */
    private JudgeService.TestCase perfCase(String name, int n, int q) {
        String packed = buildPerfCase(n, q);
        int sep = packed.indexOf("|||");
        return new JudgeService.TestCase(name, packed.substring(0, sep), packed.substring(sep + 3));
    }

    /* ============================================================
     * 题库内容
     * ============================================================ */
    private void register() {

        /* ---------- 1. 两数之和（入门） ---------- */
        add(new Problem(
                "sum-two",
                "两数之和",
                "入门",
                List.of("方法", "参数", "返回值"),
                "web-frontend/javascript",
                """
                实现 `add(int a, int b)`，返回两数之和。

                ::: tip 提示
                这是最基础的练习，用来验证判题链路是否通畅。
                注意：只需写**方法体**，不需要写 `main`，也不需要处理输入输出 ——
                评测机会自动调用你的方法并比对结果。
                """,
                """
                public static int add(int a, int b) {
                    // TODO: 在这里实现
                    return 0;
                }
                """,
                "public static int add(int a, int b)",
                "直接用 + 运算符即可",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int a = sc.nextInt();
                int b = sc.nextInt();
                System.out.println(add(a, b));
                """,
                List.of(
                        new JudgeService.TestCase("示例：1 + 2", "1 2", "3"),
                        new JudgeService.TestCase("隐藏：0 + 0", "0 0", "0"),
                        new JudgeService.TestCase("隐藏：负数", "-5 3", "-2"),
                        new JudgeService.TestCase("隐藏：两负数", "-7 -8", "-15"),
                        new JudgeService.TestCase("隐藏：大数", "1000000 2000000", "3000000")
                ),
                JudgeService.Mode.METHOD,
                5000L
        ));

        /* ---------- 2. 阶乘（简单） ---------- */
        add(new Problem(
                "factorial",
                "计算阶乘",
                "入门",
                List.of("循环", "递归", "long"),
                "web-frontend/javascript",
                """
                实现 `factorial(int n)`，返回 n 的阶乘（n!）。

                ::: warn 注意
                用 `long` 而不是 `int` —— 13! 就超过了 int 的范围（21 亿）。

                `13! = 6227020800` 已经溢出 int，用 long 才能算到 20!。
                """,
                """
                public static long factorial(int n) {
                    // TODO: 实现
                    return 0;
                }
                """,
                "public static long factorial(int n)",
                "0! 和 1! 都等于 1。如果用循环：从 2 乘到 n",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int n = sc.nextInt();
                System.out.println(factorial(n));
                """,
                List.of(
                        new JudgeService.TestCase("示例：5!", "5", "120"),
                        new JudgeService.TestCase("隐藏：0!", "0", "1"),
                        new JudgeService.TestCase("隐藏：1!", "1", "1"),
                        new JudgeService.TestCase("隐藏：10!", "10", "3628800"),
                        new JudgeService.TestCase("隐藏：20!（超过 int）", "20", "2432902008176640000")
                ),
                JudgeService.Mode.METHOD,
                5000L
        ));

        /* ---------- 3. 斐波那契（简单，考递归与迭代的差别） ---------- */
        add(new Problem(
                "fibonacci",
                "斐波那契数列",
                "简单",
                List.of("递归", "动态规划", "性能"),
                "web-frontend/javascript",
                """
                实现 `fib(int n)`，返回斐波那契数列第 n 项。

                定义：`fib(0)=0, fib(1)=1, fib(n)=fib(n-1)+fib(n-2)`

                ::: danger 性能陷阱
                朴素递归 `return fib(n-1) + fib(n-2)` 的时间复杂度是 **O(2^n)**。
                算 `fib(40)` 就要几亿次调用，**会超时**。

                隐藏用例包含 n=45，朴素递归必然超时 ——
                这正是本题要教的东西：**同样的逻辑，用迭代 O(n) 就能过。**
                """,
                """
                public static long fib(int n) {
                    // TODO: 实现。注意性能 —— 朴素递归会超时
                    return 0;
                }
                """,
                "public static long fib(int n)",
                "迭代写法：用两个变量滚动向前，只需要 O(n) 时间、O(1) 空间",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int n = sc.nextInt();
                System.out.println(fib(n));
                """,
                List.of(
                        new JudgeService.TestCase("示例：fib(10)", "10", "55"),
                        new JudgeService.TestCase("隐藏：fib(0)", "0", "0"),
                        new JudgeService.TestCase("隐藏：fib(1)", "1", "1"),
                        new JudgeService.TestCase("隐藏：fib(20)", "20", "6765"),
                        new JudgeService.TestCase("隐藏：fib(45) 性能关", "45", "1134903170")
                ),
                JudgeService.Mode.METHOD,
                3000L
        ));

        /* ---------- 4. 数组求和（简单，考基本语法） ---------- */
        add(new Problem(
                "array-sum",
                "数组求和与最大值",
                "入门",
                List.of("数组", "循环"),
                "web-frontend/javascript",
                """
                实现 `sumAndMax(int[] arr)`，返回一个 `int[]`：
                `[所有元素之和, 最大元素]`。

                输入保证数组非空。

                ::: tip 提示
                返回值也是数组 —— 评测机会打印成 `和 最大值` 的形式。
                """,
                """
                public static int[] sumAndMax(int[] arr) {
                    // TODO: 实现
                    return new int[]{0, 0};
                }
                """,
                "public static int[] sumAndMax(int[] arr)",
                "先假设第一个元素是最大值，然后遍历比较",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int n = sc.nextInt();
                int[] arr = new int[n];
                for (int i = 0; i < n; i++) arr[i] = sc.nextInt();
                int[] r = sumAndMax(arr);
                System.out.println(r[0] + " " + r[1]);
                """,
                List.of(
                        new JudgeService.TestCase("示例：[1,2,3]", "3\n1 2 3", "6 3"),
                        new JudgeService.TestCase("隐藏：单元素", "1\n42", "42 42"),
                        new JudgeService.TestCase("隐藏：全负数", "3\n-5 -2 -9", "-16 -2"),
                        new JudgeService.TestCase("隐藏：含零", "4\n0 0 0 0", "0 0"),
                        new JudgeService.TestCase("隐藏：大数组", "5\n100 200 300 400 500", "1500 500")
                ),
                JudgeService.Mode.METHOD,
                5000L
        ));

        /* ---------- 5. 字符串反转（简单，考 StringBuilder） ---------- */
        add(new Problem(
            "reverse-string",
            "字符串反转",
            "入门",
            List.of("String", "StringBuilder"),
            "web-frontend/javascript",
            """
            实现 `reverse(String s)`，返回反转后的字符串。

            ::: tip 提示
            `String` 是不可变的，用 `+` 拼接在循环里会创建大量临时对象（O(n²)）。
            用 `StringBuilder` 的 `reverse()` 或 `insert(0, c)`。
            """,
            """
            public static String reverse(String s) {
                // TODO: 实现
                return "";
            }
            """,
            "public static String reverse(String s)",
            "new StringBuilder(s).reverse().toString() 一行搞定",
            "import java.util.*;",
            """
            Scanner sc = new Scanner(System.in);
            String s = sc.hasNextLine() ? sc.nextLine() : "";
            System.out.println(reverse(s));
            """,
            List.of(
                    new JudgeService.TestCase("示例：hello", "hello", "olleh"),
                    new JudgeService.TestCase("隐藏：单字符", "a", "a"),
                    new JudgeService.TestCase("隐藏：回文", "level", "level"),
                    new JudgeService.TestCase("隐藏：空串", "", ""),
                    new JudgeService.TestCase("隐藏：中文", "学习系统", "统系习学")
            ),
            JudgeService.Mode.METHOD,
            5000L
        ));

        /* ---------- 6. 二分查找（中等，考边界） ---------- */
        add(new Problem(
                "binary-search",
                "二分查找",
                "中等",
                List.of("算法", "边界条件", "O(log n)"),
                "data-access/mysql-sql",
                """
                实现 `search(int[] arr, int target)`，在**升序**数组中查找 target，
                返回下标；不存在返回 `-1`。

                ::: danger 边界是这题的全部难点
                二分查找写错的人，几乎都是这几处：
                - `while (left <= right)` 还是 `<`？
                - `mid = (left + right) / 2` 还是 `left + (right - left) / 2`？
                  （后者防溢出：left+right 可能超过 int 上限）
                - `right = mid` 还是 `mid - 1`？

                隐藏用例包含"目标不存在"和"边界元素"，专门抓这些错。
                """,
                """
                public static int search(int[] arr, int target) {
                    // TODO: 实现二分查找
                    return -1;
                }
                """,
                "public static int search(int[] arr, int target)",
                "用 left + (right - left) / 2 计算中点，避免 (left+right) 溢出",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int n = sc.nextInt();
                int[] arr = new int[n];
                for (int i = 0; i < n; i++) arr[i] = sc.nextInt();
                int q = sc.nextInt();
                // 关键：不逐行输出（性能用例会有 20 万行，会超出输出上限被截断），
                // 而是把所有结果累加成一个校验和，最后输出一个数字。
                // 这样既能执行全部查询（真正压测算法），输出又只有几字节。
                long sum = 0;
                for (int k = 0; k < q; k++) {
                    int target = sc.nextInt();
                    sum += search(arr, target);
                }
                System.out.println(sum);
                """,
                List.of(
                        new JudgeService.TestCase("示例：找到中间", "5\n1 3 5 7 9\n1\n5", "2"),
                        new JudgeService.TestCase("隐藏：找到第一个", "5\n1 3 5 7 9\n1\n1", "0"),
                        new JudgeService.TestCase("隐藏：找到最后一个", "5\n1 3 5 7 9\n1\n9", "4"),
                        new JudgeService.TestCase("隐藏：不存在（小于全部）", "5\n1 3 5 7 9\n1\n0", "-1"),
                        new JudgeService.TestCase("隐藏：不存在（大于全部）", "5\n1 3 5 7 9\n1\n10", "-1"),
                        new JudgeService.TestCase("隐藏：单元素找到", "1\n42\n1\n42", "0"),
                        new JudgeService.TestCase("隐藏：单元素找不到", "1\n42\n1\n7", "-1"),
                        // 多组查询校验和：结果 [0,2,4] 相加 = 6
                        new JudgeService.TestCase("隐藏：多组查询", "5\n1 3 5 7 9\n3\n1 5 9", "6"),
                        // ★ 性能护栏：30 万次查询 × 30 万元素
                        //
                        //   规模由 tools/test-perf2.mjs 实测标定，见下方 timeout 注释。
                        //   用校验和（而不是逐行输出）避免撞上 2 万字符的输出上限。
                        perfCase("隐藏：性能护栏（30万次查询×30万元素）", 300000, 300000)
                ),
                JudgeService.Mode.METHOD,
                // ══════════════════════════════════════════════════════
                //  超时阈值的标定过程（值得记录，因为它踩了三次坑）
                // ══════════════════════════════════════════════════════
                //
                //  第 1 次：50 万数组 + 1 次查询，阈值 5000ms
                //    → 线性扫描只花几毫秒，直接通过 ✗
                //    教训：「单次查询时 O(n) 的常数本身就小」。
                //          50 万次数组访问在现代 CPU 上只要 1~2ms。
                //
                //  第 2 次：20 万查询 × 20 万元素，阈值 3000ms
                //    → 二分 1019ms / 线性 5346ms，理论上能区分，
                //      但阈值窗口太窄，实测线性有时 4909ms（贴着阈值），
                //      慢机器上正确解法也会被误杀 ✗
                //
                //  第 3 次：10 万 × 10 万，阈值 2500ms
                //    → 二分 1069ms / 线性 2063ms，只差 2 倍，更糟 ✗
                //
                //  最终：30 万 × 30 万，阈值 5000ms
                //    实测（tools/test-perf2.mjs）：
                //      二分查找 O(log n)：  1338ms   ← 阈值给了 3.7 倍余量
                //      线性扫描 O(n)：     11353ms   ← 阈值只有它的 44%
                //    倍数 8.5x，窗口足够宽，机器快慢 2 倍都不影响判定 ✓
                //
                //  ⚠️ 诚实的说明：时间阈值判题天然受机器性能影响。
                //     工业界的做法是限制指令数（JVM 插桩）或
                //     用「相对标准解法的耗时倍数」判定。
                //     本项目在进程级沙箱的能力范围内，选择「宽窗口 + 大倍数」，
                //     宁可放过个别优化过的线性实现，也不误杀正确解法。
                5000L
        ));

        /* ---------- 7. 去重并排序（中等，考集合） ---------- */
        add(new Problem(
                "dedupe-sort",
                "去重并排序",
                "简单",
                List.of("Set", "TreeSet", "集合"),
                "data-access/mysql-sql",
                """
                实现 `dedupeSort(int[] arr)`，返回**去重且升序**排列的数组。

                ::: tip 提示
                `TreeSet<Integer>` 一次搞定去重 + 排序（O(n log n)）。
                注意返回 `int[]`，需要把 Set 转回数组。
                """,
                """
                public static int[] dedupeSort(int[] arr) {
                    // TODO: 实现
                    return new int[0];
                }
                """,
                "public static int[] dedupeSort(int[] arr)",
                "TreeSet<Integer> set = new TreeSet<>(); 然后 set.stream().mapToInt(...).toArray()",
                "import java.util.*;",
                """
                Scanner sc = new Scanner(System.in);
                int n = sc.nextInt();
                int[] arr = new int[n];
                for (int i = 0; i < n; i++) arr[i] = sc.nextInt();
                int[] r = dedupeSort(arr);
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < r.length; i++) {
                    if (i > 0) sb.append(" ");
                    sb.append(r[i]);
                }
                System.out.println(sb.toString());
                """,
                List.of(
                        new JudgeService.TestCase("示例：有重复", "5\n3 1 2 3 1", "1 2 3"),
                        new JudgeService.TestCase("隐藏：全相同", "4\n7 7 7 7", "7"),
                        new JudgeService.TestCase("隐藏：已有序", "3\n1 2 3", "1 2 3"),
                        new JudgeService.TestCase("隐藏：全负数", "4\n-1 -3 -1 -2", "-3 -2 -1"),
                        new JudgeService.TestCase("隐藏：单元素", "1\n5", "5")
                ),
                JudgeService.Mode.METHOD,
                5000L
        ));
    }
}

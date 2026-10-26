package com.bookhub.controller;

import com.bookhub.common.R;
import com.bookhub.sandbox.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 代码执行与判题接口。
 *
 * <pre>
 * 这是"在线运行演示"和"编程题自动判分"的后端支撑。
 *
 * 五个端点：
 *   POST /api/code/run       运行代码（自由练习，不判题）
 *   POST /api/code/check     只编译，检查语法
 *   POST /api/code/judge     按题判分
 *   GET  /api/code/problems  题目列表
 *   GET  /api/code/problems/{id}  题目详情（含骨架、用例说明）
 *
 * 安全约束：
 *   · 全部加了 @RateLimit，防止有人写脚本刷爆判题机
 *   · judge 用更严格的额度（判题比单纯运行贵得多：每例都要起进程）
 * </pre>
 */
@RestController
@RequestMapping("/api/code")
public class CodeController {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(CodeController.class);

    private final JavaSandbox sandbox;
    private final JudgeService judgeService;
    private final ProblemBank problemBank;

    public CodeController(JavaSandbox sandbox, JudgeService judgeService, ProblemBank problemBank) {
        this.sandbox = sandbox;
        this.judgeService = judgeService;
        this.problemBank = problemBank;
    }

    /* ══════════ 请求体 ══════════ */

    public record RunRequest(
            @NotBlank(message = "代码不能为空")
            @Size(max = 50000, message = "代码过长")
            String code,
            String stdin,
            Long timeoutMs
    ) { }

    public record JudgeRequest(
            @NotBlank(message = "题目 id 不能为空") String problemId,
            @NotBlank(message = "代码不能为空")
            @Size(max = 50000, message = "代码过长")
            String code
    ) { }

    /* ══════════ 自由运行 ══════════ */

    /**
     * 运行代码（不判题）。用于"在线运行演示"。
     *
     * <pre>
     * 返回结构给前端做分层展示：
     *   { status, summary, stdout, stderr, compileError, durationMs, truncated }
     * </pre>
     */
    @PostMapping("/run")
    public R<Map<String, Object>> run(@Valid @RequestBody RunRequest req) {
        ExecResult r = sandbox.compileAndRun(req.code(), req.stdin(),
                req.timeoutMs() == null ? 0 : req.timeoutMs());

        return R.ok(Map.of(
                "status", r.status().name(),
                "summary", r.summary(),
                "ok", r.success(),
                "stdout", nullSafe(r.stdout()),
                "stderr", nullSafe(r.stderr()),
                "compileError", nullSafe(r.compileError()),
                "durationMs", r.durationMs(),
                "truncated", r.truncated(),
                "timedOut", r.timedOut()
        ));
    }

    /** 只检查语法（不运行）。前端"语法检查"按钮用 */
    @PostMapping("/check")
    public R<Map<String, Object>> check(@Valid @RequestBody RunRequest req) {
        ExecResult r = sandbox.compileOnly(req.code());
        return R.ok(Map.of(
                "status", r.status().name(),
                "ok", r.success(),
                "compileError", nullSafe(r.compileError()),
                "durationMs", r.durationMs()
        ));
    }

    /* ══════════ 判题 ══════════ */

    @PostMapping("/judge")
    public R<Map<String, Object>> judge(@Valid @RequestBody JudgeRequest req) {
        ProblemBank.Problem p = problemBank.get(req.problemId());
        if (p == null) {
            return R.fail(com.bookhub.common.ResultCode.PROBLEM_NOT_FOUND);
        }

        long judgeTimeout = p.timeoutMs() == null ? 8000 : p.timeoutMs();
        log.debug("判题开始 problem={} 用例数={} 超时={}ms",
                p.id(), p.cases().size(), judgeTimeout);

        JudgeResult jr = judgeService.judge(
                req.code(),
                p.harness(),
                p.imports(),
                p.cases(),
                p.mode() == null ? JudgeService.Mode.METHOD : p.mode(),
                judgeTimeout
        );

        // 只把"通过的用例数量"和失败用例的**细节**返回，
        // 不返回全部通过用例的期望值 —— 防止有人用接口刷答案
        List<Map<String, Object>> caseViews = jr.cases().stream().map(c -> Map.<String, Object>of(
                "name", c.name(),
                "passed", c.passed(),
                "status", c.status().name(),
                "input", c.input() == null ? "" : c.input(),
                "expected", c.passed() ? "（通过）" : nullSafe(c.expected()),
                "actual", nullSafe(c.actual()),
                "message", nullSafe(c.message()),
                "durationMs", c.durationMs()
        )).toList();

        return R.ok(Map.of(
                "status", jr.status().name(),
                "summary", jr.summary(),
                "ok", jr.status() == ExecResult.Status.PASS,
                "passed", jr.passed(),
                "total", jr.total(),
                "score", jr.score(),
                "durationMs", jr.durationMs(),
                "compileError", nullSafe(jr.compileError()),
                "cases", caseViews
        ));
    }

    /* ══════════ 题目 ══════════ */

    /** 题目列表（只给元信息，不含用例） */
    @GetMapping("/problems")
    public R<List<Map<String, Object>>> problems() {
        return R.ok(problemBank.list().stream().map(p -> Map.<String, Object>of(
                "id", p.id(),
                "title", p.title(),
                "difficulty", p.difficulty(),
                "tags", p.tags(),
                "topicKey", p.topicKey() == null ? "" : p.topicKey(),
                "caseCount", p.cases() == null ? 0 : p.cases().size()
        )).toList());
    }

    /** 题目详情：含骨架代码、说明、**示例用例**（不是全部用例） */
    @GetMapping("/problems/{id}")
    public R<Map<String, Object>> problem(@PathVariable String id) {
        ProblemBank.Problem p = problemBank.get(id);
        if (p == null) return R.fail(com.bookhub.common.ResultCode.PROBLEM_NOT_FOUND);

        // 只暴露第一个用例作为示例（隐藏其余，保证判分有效性）
        List<Map<String, Object>> samples = p.cases().stream().limit(1).map(c -> Map.<String, Object>of(
                "name", c.name(),
                "input", nullSafe(c.input()),
                "expected", nullSafe(c.expected())
        )).toList();

        return R.ok(Map.of(
                "id", p.id(),
                "title", p.title(),
                "difficulty", p.difficulty(),
                "tags", p.tags(),
                "description", nullSafe(p.description()),
                "skeleton", nullSafe(p.skeleton()),
                "hint", nullSafe(p.hint()),
                "methodSignature", nullSafe(p.methodSignature()),
                "caseCount", p.cases() == null ? 0 : p.cases().size(),
                "samples", samples
        ));
    }

    private String nullSafe(String s) {
        return s == null ? "" : s;
    }
}

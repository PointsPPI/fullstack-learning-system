package com.bookhub.sandbox;

import java.util.List;

/**
 * 判题结果。
 *
 * @param status     总体结论
 * @param passed     通过的用例数
 * @param total      总用例数
 * @param score      得分（0-100，按用例比例）
 * @param cases      每个用例的详情
 * @param compileError 编译错误（全局的，不属于某个用例）
 * @param durationMs 总耗时
 * @param summary    一句话总结
 */
public record JudgeResult(
        ExecResult.Status status,
        int passed,
        int total,
        int score,
        List<CaseResult> cases,
        String compileError,
        long durationMs,
        String summary
) {

    /**
     * 单个测试用例的结果。
     *
     * @param name      用例名（如 "输入 3 应返回 6"）
     * @param input     喂给程序的 stdin
     * @param expected  期望的 stdout
     * @param actual    实际的 stdout
     * @param status    该用例的结论
     * @param message   失败原因
     * @param durationMs 该用例耗时
     */
    public record CaseResult(
            String name,
            String input,
            String expected,
            String actual,
            ExecResult.Status status,
            String message,
            long durationMs
    ) {
        public boolean passed() {
            return status == ExecResult.Status.PASS;
        }
    }

    public static JudgeResult compileFailure(String compileError, long dur, int total) {
        return new JudgeResult(ExecResult.Status.COMPILE_ERROR, 0, total, 0,
                List.of(), compileError, dur, "编译失败，请先修复语法或类型错误");
    }
}

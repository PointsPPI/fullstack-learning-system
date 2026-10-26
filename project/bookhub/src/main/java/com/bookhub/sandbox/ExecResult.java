package com.bookhub.sandbox;

import java.nio.file.Path;

/**
 * 代码执行结果。
 *
 * <pre>
 * 分三层信息，前端可以分层展示：
 *   ① status     —— 结论（通过/编译错/运行错/超时/答案错）
 *   ② compileError / stderr —— 给"看得懂报错"用
 *   ③ stdout / durationMs   —— 给"看到运行效果"用
 *
 * 为什么把编译错误单独拿出来？
 *   编译错误和运行错误对学习者是完全不同的信号：
 *     编译错 → 语法/类型问题，改一行就行
 *   运行错 → 逻辑问题，程序跑到一半挂了
 *   混在一起会让人不知道从哪下手。
 * </pre>
 *
 * @param status       执行结论
 * @param compileError 编译错误信息（成功时为 null）
 * @param stderr       运行期错误输出
 * @param stdout       标准输出
 * @param durationMs   耗时（毫秒）
 * @param exitCode     进程退出码
 * @param timedOut     是否超时被杀
 * @param truncated    输出是否被截断
 */
public record ExecResult(
        Status status,
        String compileError,
        String stderr,
        String stdout,
        long durationMs,
        int exitCode,
        boolean timedOut,
        boolean truncated,
        Path workDir
) {

    public enum Status {
        /** 全部通过 */
        PASS,
        /** 编译失败 */
        COMPILE_ERROR,
        /** 运行时抛异常 */
        RUNTIME_ERROR,
        /** 超时（疑似死循环） */
        TIMEOUT,
        /** 输出不符合预期（判题时用） */
        WRONG_ANSWER,
        /** 系统内部错误（不是用户代码的问题） */
        SYSTEM_ERROR
    }

    public boolean success() {
        return status == Status.PASS;
    }

    /** 给前端的一句话结论 */
    public String summary() {
        return switch (status) {
            case PASS -> "通过";
            case COMPILE_ERROR -> "编译失败";
            case RUNTIME_ERROR -> "运行出错";
            case TIMEOUT -> "运行超时（可能存在死循环）";
            case WRONG_ANSWER -> "输出与预期不符";
            case SYSTEM_ERROR -> "评测系统异常";
        };
    }
}

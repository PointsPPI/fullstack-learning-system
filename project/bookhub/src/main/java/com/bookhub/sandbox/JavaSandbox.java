package com.bookhub.sandbox;

import com.bookhub.common.BizException;
import com.bookhub.common.ResultCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * Java 代码沙箱 —— 编译 + 运行用户代码，带超时与资源限制。
 *
 * <pre>
 * ══════════════════════════════════════════════════════════════
 *  安全边界声明（很重要，请先读这段）
 * ══════════════════════════════════════════════════════════════
 *
 * 这是**本地学习用的沙箱**，不是生产级多租户隔离。
 * 它防范的是"学生写了死循环/无限输出"这类意外，
 * 不防范"有人故意写恶意代码逃逸"。
 *
 * 已实现的防护：
 *   ① 独立临时目录：每次运行一个 uuid 目录，跑完即删
 *   ② 强制超时：Process.waitFor(timeout)，超时 destroyForcibly 强杀
 *   ③ 输出上限：读流时超过 maxOutput 立即截断（防无限输出撑爆内存）
 *   ④ 内存上限：JVM 参数 -Xmx256m
 *   ⑤ 无 stdin：标准输入直接关闭（防止用户代码阻塞等待输入）
 *   ⑥ 代码长度限制：拒绝超长代码
 *
 * 未实现（生产级才需要）：
 *   · 禁危险 API（System.exit / Runtime.exec / 文件写 / 网络 / 反射）
 *     —— 需要自定义 SecurityManager（JDK17+ 已废弃）或容器隔离
 *   · cgroup 级 CPU/内存限额
 *   · 独立低权限用户运行
 *
 * 如果你要对外提供服务，请用 Docker 容器 + 只读根文件系统 + 无网络 + seccomp。
 *
 * ══════════════════════════════════════════════════════════════
 *  为什么用 javac + java 而不是 JShell 或动态编译库？
 * ══════════════════════════════════════════════════════════════
 *   · JShell 不产生 class 文件，看不到编译错误的位置信息
 *   · javax.tools.JavaCompiler 是进程内编译，一旦用户代码让编译器 OOM，
 *     整个后端进程就挂了。用**独立进程**跑 javac 才安全。
 *   · 独立进程还天然支持超时强杀 —— 这是防死循环的唯一可靠手段
 *     （Thread.stop 已废弃，无法安全中断一个死循环线程）。
 * </pre>
 */
@Service
public class JavaSandbox {

    private static final Logger log = LoggerFactory.getLogger(JavaSandbox.class);

    /** javac / java 可执行文件路径（可用 application.yml 覆盖） */
    @Value("${sandbox.jdk-home:D:\\Java 21}")
    private String jdkHome;

    /** 编译超时（毫秒）—— 编译通常 <2 秒，超过说明有异常 */
    @Value("${sandbox.compile-timeout-ms:15000}")
    private long compileTimeoutMs;

    /** 运行超时（毫秒） */
    @Value("${sandbox.run-timeout-ms:8000}")
    private long runTimeoutMs;

    /** 输出上限（字符数）—— 超过即截断，防无限输出 */
    @Value("${sandbox.max-output:20000}")
    private int maxOutput;

    /** 代码长度上限 */
    @Value("${sandbox.max-code-length:50000}")
    private int maxCodeLength;

    /** 堆内存上限 */
    @Value("${sandbox.max-heap-mb:256}")
    private int maxHeapMb;

    /* ============================================================
     * 对外主入口
     * ============================================================ */

    /**
     * 编译并运行一段 Java 代码。
     *
     * @param code       完整源码（必须包含 public class Main）
     * @param stdin      标准输入（可为空）
     * @param timeoutMs  指定超时（0 = 用默认值）
     */
    public ExecResult compileAndRun(String code, String stdin, long timeoutMs) {
        validate(code);

        Path workDir = null;
        long start = System.currentTimeMillis();
        try {
            workDir = Files.createTempDirectory("ls-sandbox-");

            // ① 代码必须叫 Main.java（否则 public class 与文件名不匹配，javac 会报错）
            Path srcFile = workDir.resolve("Main.java");
            Files.writeString(srcFile, code, StandardCharsets.UTF_8);

            // ② 编译
            ProcOut compile = exec(
                    List.of(jdkPath("javac"), "-encoding", "UTF-8",
                            "-J-Duser.language=en", "-J-Duser.country=US",
                            "-d", workDir.toString(), srcFile.toString()),
                    workDir, null, compileTimeoutMs, 8000);

            if (compile.timedOut) {
                return new ExecResult(ExecResult.Status.COMPILE_ERROR, "编译超时（代码可能有异常结构）",
                        null, null, System.currentTimeMillis() - start, -1, true, compile.truncated, workDir);
            }
            if (compile.exitCode != 0) {
                String err = cleanCompileError(compile.stderr, workDir);
                return new ExecResult(ExecResult.Status.COMPILE_ERROR, err,
                        null, null, System.currentTimeMillis() - start, compile.exitCode,
                        false, compile.truncated, workDir);
            }

            // ③ 运行（独立进程 + 强制超时）
            long runTimeout = timeoutMs > 0 ? timeoutMs : runTimeoutMs;
            ProcOut run = exec(
                    List.of(jdkPath("java"),
                            "-Xmx" + maxHeapMb + "m",
                            "-XX:+UseSerialGC",          // 小内存下启动更快
                            "-Dfile.encoding=UTF-8",
                            "-Dstdout.encoding=UTF-8",
                            "-Dstderr.encoding=UTF-8",
                            "-cp", workDir.toString(),
                            "Main"),
                    workDir, stdin, runTimeout, maxOutput);

            long dur = System.currentTimeMillis() - start;

            if (run.timedOut) {
                return new ExecResult(ExecResult.Status.TIMEOUT, null,
                        "运行超过 " + runTimeout + "ms 被强制终止（可能存在死循环或过度递归）",
                        run.stdout, dur, -1, true, run.truncated, workDir);
            }

            if (run.exitCode != 0) {
                return new ExecResult(ExecResult.Status.RUNTIME_ERROR, null,
                        cleanRuntimeError(run.stderr), run.stdout, dur, run.exitCode,
                        false, run.truncated, workDir);
            }

            return new ExecResult(ExecResult.Status.PASS, null, run.stderr,
                    run.stdout, dur, 0, false, run.truncated, workDir);

        } catch (IOException e) {
            log.error("沙箱 IO 异常", e);
            return new ExecResult(ExecResult.Status.SYSTEM_ERROR, null, e.getMessage(),
                    null, System.currentTimeMillis() - start, -1, false, false, workDir);
        } finally {
            cleanup(workDir);
        }
    }

    /** 只编译不运行（用于"检查语法"功能） */
    public ExecResult compileOnly(String code) {
        validate(code);
        Path workDir = null;
        long start = System.currentTimeMillis();
        try {
            workDir = Files.createTempDirectory("ls-check-");
            Path srcFile = workDir.resolve("Main.java");
            Files.writeString(srcFile, code, StandardCharsets.UTF_8);

            ProcOut r = exec(
                    List.of(jdkPath("javac"), "-encoding", "UTF-8",
                            "-J-Duser.language=en", "-J-Duser.country=US",
                            "-d", workDir.toString(), srcFile.toString()),
                    workDir, null, compileTimeoutMs, 8000);

            long dur = System.currentTimeMillis() - start;
            if (r.exitCode == 0) {
                return new ExecResult(ExecResult.Status.PASS, null, null, null, dur, 0, false, false, workDir);
            }
            return new ExecResult(ExecResult.Status.COMPILE_ERROR,
                    cleanCompileError(r.stderr, workDir), null, null, dur, r.exitCode,
                    r.timedOut, r.truncated, workDir);
        } catch (IOException e) {
            return new ExecResult(ExecResult.Status.SYSTEM_ERROR, null, e.getMessage(),
                    null, System.currentTimeMillis() - start, -1, false, false, workDir);
        } finally {
            cleanup(workDir);
        }
    }

    /* ============================================================
     * 内部：进程执行 + 超时 + 输出截断
     * ============================================================ */

    private record ProcOut(int exitCode, String stdout, String stderr, boolean timedOut, boolean truncated) { }

    /**
     * 启动子进程并等待，超时则强杀。
     *
     * <pre>
     * 三个必须注意的细节：
     *
     * ① 必须**并发**读 stdout 和 stderr
     *    如果先读 stdout 再读 stderr，当 stderr 写满管道缓冲区（通常 64KB）时，
     *    子进程会阻塞在写 stderr 上，而你在阻塞读 stdout → 死锁。
     *
     * ② 超时后必须 destroyForcibly()
     *    destroy() 只是发送终止信号，死循环里根本不响应。
     *    destroyForcibly() 是 SIGKILL 级别，但**还要 waitFor 确认真的退出**，
     *    否则进程可能变成僵尸。
     *
     * ③ 必须关闭 stdin
     *    否则 Scanner(System.in) 会一直阻塞等待输入，看起来像"死循环"。
     * </pre>
     */
    private ProcOut exec(List<String> cmd, Path workDir, String stdin,
                         long timeoutMs, int outputLimit) throws IOException {

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(workDir.toFile());
        pb.redirectErrorStream(false);

        Process proc = pb.start();

        // ③ 写入 stdin —— 必须在独立线程里做
        //
        // ⚠️ 这是本项目踩过的真实坑，值得记下来：
        //   操作系统的管道缓冲区通常只有 64KB。
        //   性能测试用例的 stdin 有 2MB（30 万数字）。
        //   如果在当前线程一次性 os.write()：
        //     · 缓冲区满 → 阻塞等待子进程读
        //     · 子进程此刻可能正在写 stdout，也阻塞了
        //     → 双向死锁，或者子进程只读到一部分就 EOF 退出
        //
        //   实测症状：waitFor(5000ms) 只等了 115ms 就返回 true，
        //   因为程序读到残缺输入后立刻就结束了 —— 看起来"跑得很快"，
        //   实际是"根本没跑"。
        //
        //   正确做法：独立线程分块写，主线程继续读 stdout/stderr。
        final byte[] stdinBytes = (stdin != null && !stdin.isEmpty())
                ? stdin.getBytes(StandardCharsets.UTF_8) : new byte[0];
        Thread stdinWriter = new Thread(() -> {
            try (OutputStream os = proc.getOutputStream()) {
                int off = 0;
                final int chunk = 32 * 1024;
                while (off < stdinBytes.length) {
                    int len = Math.min(chunk, stdinBytes.length - off);
                    os.write(stdinBytes, off, len);
                    os.flush();
                    off += len;
                }
                os.flush();
            } catch (IOException ignored) {
                // 用户代码不读 stdin 时写入会失败（EPIPE），正常现象
            }
        }, "sandbox-stdin");
        stdinWriter.setDaemon(true);
        stdinWriter.start();

        // ① 并发读两个流
        StringBuilder outBuf = new StringBuilder();
        StringBuilder errBuf = new StringBuilder();
        boolean[] truncated = {false};

        Thread outReader = readerThread(proc.getInputStream(), outBuf, truncated, outputLimit);
        Thread errReader = readerThread(proc.getErrorStream(), errBuf, truncated, outputLimit);
        outReader.start();
        errReader.start();

        boolean finished;
        try {
            finished = proc.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            proc.destroyForcibly();
            return new ProcOut(-1, outBuf.toString(), errBuf.toString(), true, truncated[0]);
        }

        if (!finished) {
            // ② 强杀 + 确认退出
            proc.destroyForcibly();
            try {
                proc.waitFor(3, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        // 等读取线程收尾（最多 2 秒，防止流未关闭导致挂住）
        try {
            outReader.join(2000);
            errReader.join(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        int exit = finished ? proc.exitValue() : -1;
        return new ProcOut(exit, outBuf.toString(), errBuf.toString(), !finished, truncated[0]);
    }

    private Thread readerThread(InputStream in, StringBuilder sb, boolean[] truncated, int limit) {
        return new Thread(() -> {
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(in, StandardCharsets.UTF_8))) {
                char[] buf = new char[4096];
                int n;
                while ((n = br.read(buf)) != -1) {
                    if (sb.length() + n > limit) {
                        sb.append(buf, 0, Math.max(0, limit - sb.length()));
                        sb.append("\n[输出超过 ").append(limit).append(" 字符，已截断]");
                        truncated[0] = true;
                        // 继续读但丢弃，否则子进程会因管道满而阻塞
                        while (br.read(buf) != -1) { /* discard */ }
                        break;
                    }
                    sb.append(buf, 0, n);
                }
            } catch (IOException ignored) {
                // 进程被杀时流会异常关闭，正常
            }
        });
    }

    /* ============================================================
     * 内部：清理与美化
     * ============================================================ */

    private void validate(String code) {
        if (code == null || code.isBlank()) {
            throw new BizException(ResultCode.CODE_TOO_LONG, "代码不能为空");
        }
        if (code.length() > maxCodeLength) {
            throw new BizException(ResultCode.CODE_TOO_LONG,
                    "代码长度 " + code.length() + " 超过上限 " + maxCodeLength);
        }
        // 必须有一个 public class Main（javac 要求 public 类名与文件名一致）
        if (!code.contains("class Main")) {
            throw new BizException(ResultCode.PARAM_INVALID,
                    "代码必须包含 `public class Main`（沙箱以文件名 Main.java 编译）");
        }
    }

    /**
     * 清理编译错误信息：把临时目录的绝对路径替换成 Main.java，
     * 否则前端会看到 C:\Users\xxx\AppData\Local\Temp\ls-sandbox-123456\Main.java:5
     * 这类无关噪音，既难读又泄露本机路径。
     */
    private String cleanCompileError(String stderr, Path workDir) {
        if (stderr == null) return null;
        String s = stderr;
        String dir = workDir.toAbsolutePath().toString();
        s = s.replace(dir + File.separator, "")
             .replace(dir, "")
             .replace("\\Main.java", "Main.java")
             .replace("/Main.java", "Main.java");
        // 去掉 javac 结尾的"1 error"统计行（信息量低）
        s = s.replaceAll("(?m)^\\d+ (error|warning)s?$", "").trim();
        return s;
    }

    /**
     * 清理运行时错误：保留异常类型与消息，**移除堆栈中的沙箱路径**，
     * 但保留行号（学习者需要知道哪一行出错）。
     */
    private String cleanRuntimeError(String stderr) {
        if (stderr == null || stderr.isBlank()) return null;
        String[] lines = stderr.split("\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            // 跳过 "at java.base/..." 这类框架栈帧，只留用户代码的帧
            if (line.trim().startsWith("at java.") || line.trim().startsWith("at jdk.")) continue;
            String cleaned = line.replaceAll("(?i).*Main\\.java", "\tat Main.java");
            sb.append(cleaned).append('\n');
        }
        return sb.toString().trim();
    }

    private String jdkPath(String tool) {
        String exe = tool + (isWindows() ? ".exe" : "");
        return Paths.get(jdkHome, "bin", exe).toString();
    }

    private boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    /** 递归删除临时目录。删不掉不抛错（Windows 文件锁常见） */
    private void cleanup(Path dir) {
        if (dir == null) return;
        try {
            Files.walk(dir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (IOException ignored) { }
                    });
        } catch (IOException ignored) {
            // ignore
        }
    }
}

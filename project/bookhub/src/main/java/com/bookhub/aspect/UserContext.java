package com.bookhub.aspect;

/**
 * 当前登录用户上下文（ThreadLocal）。
 *
 * <pre>
 * 为什么用 ThreadLocal 而不是把 userId 一路当参数传？
 *   一个请求从 Controller → Service → Mapper 要经过多层，
 *   如果把 userId 加进每个方法签名，代码会变成：
 *     borrow(Long bookId, Long readerId, Long userId)
 *     doBorrow(Long bookId, Long readerId, Long userId)
 *     checkLimit(Long readerId, Long userId)
 *   —— 一半参数都是"当前用户"，而且改一次要动整条链。
 *
 * ⚠️ 但 ThreadLocal 有一个必须记住的陷阱：内存泄漏与数据串号。
 *   Tomcat 线程池复用线程，如果请求结束不清理，
 *   下一个请求可能读到上一个用户的 id（越权事故）。
 *   所以 afterCompletion 里必须 clear() —— 见 AuthInterceptor。
 * </pre>
 */
public final class UserContext {

    private static final ThreadLocal<Long> USER = new ThreadLocal<>();

    private UserContext() { }

    public static void set(Long userId) {
        USER.set(userId);
    }

    public static Long get() {
        return USER.get();
    }

    public static Long require() {
        Long id = USER.get();
        if (id == null) throw new IllegalStateException("当前请求未认证");
        return id;
    }

    /** ★ 必须在请求结束时调用，否则线程复用会导致数据串号 */
    public static void clear() {
        USER.remove();
    }
}

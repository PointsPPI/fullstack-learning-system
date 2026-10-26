package com.bookhub.aspect;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口限流注解 —— 基于 Redis + Lua 的滑动窗口计数器。
 *
 * <pre>
 * 用法：
 *   @RateLimit(times = 5, seconds = 60, key = "borrow")
 *   public R<?> borrow(...) { }
 *
 * 为什么限流要放 Redis 而不是本地缓存？
 *   本地计数器只能限制"单个节点"的流量。
 *   3 台服务器 × 本地限 5 次 = 实际 15 次，限流形同虚设。
 *   Redis 是全局共享的，所有节点看到同一个计数。
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    /** 时间窗口内允许的次数 */
    int times() default 10;

    /** 时间窗口（秒） */
    int seconds() default 60;

    /** 限流维度 */
    Dimension by() default Dimension.IP;

    /** 自定义 key 后缀（同一接口不同业务可分开限） */
    String key() default "";

    /** 限流维度 */
    enum Dimension {
        /** 按调用方 IP（防刷接口） */
        IP,
        /** 按用户（需登录，取自 UserContext） */
        USER,
        /** 整个接口全局（保护下游服务，如发短信） */
        GLOBAL
    }
}

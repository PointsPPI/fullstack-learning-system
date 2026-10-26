package com.bookhub.aspect;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 幂等注解 —— 防止重复提交（网络重试、用户双击、恶意刷）。
 *
 * <pre>
 * 用法：
 *   @Idempotent(seconds = 5)
 *   public R<Long> create(@RequestBody BookCreateDTO dto) { }
 *
 * 原理：
 *   用「方法签名 + 请求参数哈希」生成 key，SETNX 到 Redis。
 *   5 秒内相同请求第二次会被拒绝。
 *
 * 与"分布式锁"的区别：
 *   分布式锁：同一时刻只允许一个执行（串行化，后者等待）
 *   幂等    ：一段时间内只允许执行一次（后者直接拒绝或返回上次结果）
 *
 * 这个区别很关键：
 *   抢库存用锁（后者应该等待然后成功）；
 *   下单用幂等（后者应该被告知"你已经下过了"）。
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Idempotent {

    /** 幂等窗口（秒）—— 窗口内重复请求被拒绝 */
    int seconds() default 3;

    /** 是否缓存首次结果并原样返回（true=返回上次结果，false=直接报错） */
    boolean returnCache() default false;

    /** 自定义 key 后缀 */
    String key() default "";
}

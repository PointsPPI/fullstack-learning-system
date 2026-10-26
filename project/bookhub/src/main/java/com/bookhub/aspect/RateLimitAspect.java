package com.bookhub.aspect;

import com.bookhub.common.BizException;
import com.bookhub.common.ResultCode;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collections;

/**
 * 限流切面 —— Redis + Lua 原子实现固定窗口计数器。
 *
 * <pre>
 * 为什么必须用 Lua 而不是"先 INCR 再 EXPIRE"？
 *   两条命令之间如果进程崩溃/网络中断，key 会永久存在 → 用户被永久限流。
 *   Lua 脚本在 Redis 内部一次性执行，原子且不会中途失败。
 *
 * 脚本逻辑：
 *   local c = INCR(key)              -- 计数 +1，返回新值
 *   if c == 1 then EXPIRE(key, ttl)  -- 第一次设置过期
 *   return c
 *
 * 为什么 if c == 1 才设过期？
 *   每次都设 EXPIRE 会让窗口"永不过期"（滑动窗口行为），
 *   而我们要的是固定窗口：第一次请求开启窗口，ttl 秒后重置。
 * </pre>
 */
@Aspect
@Component
@org.springframework.core.annotation.Order(1)   // 最外层：最便宜的检查先执行
public class RateLimitAspect {

    private final StringRedisTemplate redis;

    /** 原子限流脚本 */
    private static final DefaultRedisScript<Long> LIMIT_SCRIPT = new DefaultRedisScript<>(
            "local c = redis.call('incr', KEYS[1]) " +
            "if c == 1 then " +
            "  redis.call('expire', KEYS[1], ARGV[1]) " +
            "end " +
            "return c",
            Long.class
    );

    public RateLimitAspect(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint pjp, RateLimit rateLimit) throws Throwable {
        String key = buildKey(pjp, rateLimit);

        Long count = redis.execute(LIMIT_SCRIPT,
                Collections.singletonList(key),
                String.valueOf(rateLimit.seconds()));

        if (count != null && count > rateLimit.times()) {
            // 返回剩余等待时间，让前端能提示"XX 秒后再试"
            Long ttl = redis.getExpire(key, java.util.concurrent.TimeUnit.SECONDS);
            throw new BizException(ResultCode.TOO_MANY_REQUESTS,
                    String.format("请求过于频繁（%d 秒内最多 %d 次），请 %d 秒后再试",
                            rateLimit.seconds(), rateLimit.times(), ttl != null && ttl > 0 ? ttl : 1));
        }

        return pjp.proceed();
    }

    private String buildKey(ProceedingJoinPoint pjp, RateLimit rl) {
        String method = pjp.getSignature().toShortString();
        String suffix = rl.key().isEmpty() ? method : rl.key();

        String dimension = switch (rl.by()) {
            case IP -> "ip:" + clientIp();
            case USER -> "user:" + currentUser();
            case GLOBAL -> "global";
        };

        return "rate:" + suffix + ":" + dimension;
    }

    /** 取真实客户端 IP（考虑 Nginx 反代场景） */
    private String clientIp() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) return "unknown";
        HttpServletRequest req = attrs.getRequest();

        // 优先取代理转发的真实 IP（否则所有请求的 IP 都是 Nginx 的）
        for (String h : new String[]{"X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP"}) {
            String v = req.getHeader(h);
            if (v != null && !v.isBlank() && !"unknown".equalsIgnoreCase(v)) {
                // X-Forwarded-For 可能是逗号分隔的链，第一个是客户端
                return v.split(",")[0].trim();
            }
        }
        return req.getRemoteAddr();
    }

    /** 当前用户标识（未登录时用匿名） */
    private String currentUser() {
        Object u = UserContext.get();
        return u == null ? "anonymous" : String.valueOf(u);
    }
}

package com.bookhub.aspect;

import com.bookhub.common.BizException;
import com.bookhub.common.ResultCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Arrays;
import java.util.HexFormat;

/**
 * 幂等切面 —— 用 Redis SETNX 保证"一段时间内只执行一次"。
 *
 * <pre>
 * key 的构成：idem:{方法}:{用户}:{参数哈希}
 *
 * 为什么参数也要参与哈希？
 *   只按方法限流会导致"用户连买两本不同的书"被误拦。
 *   按参数哈希才能精确到"同一个请求"。
 *
 * 为什么用 SETNX 而不是先 GET 再 SET？
 *   GET + SET 之间有时序窗口，两个并发请求可能都通过。
 *   SETNX 是原子的，"谁先到谁设成功"。
 * </pre>
 */
@Aspect
@Component
@org.springframework.core.annotation.Order(2)   // 中层：比限流贵，比业务锁便宜
public class IdempotentAspect {

    private final StringRedisTemplate redis;
    private final ObjectMapper om;

    public IdempotentAspect(StringRedisTemplate redis, ObjectMapper om) {
        this.redis = redis;
        this.om = om;
    }

    @Around("@annotation(idem)")
    public Object around(ProceedingJoinPoint pjp, Idempotent idem) throws Throwable {
        String key = buildKey(pjp, idem);

        // 原子占位：成功表示"我是第一个"
        Boolean first = redis.opsForValue()
                .setIfAbsent(key, "1", Duration.ofSeconds(idem.seconds()));

        if (!Boolean.TRUE.equals(first)) {
            if (idem.returnCache()) {
                // 返回上次结果（适合"查询类 + 写入"混合的接口）
                String cached = redis.opsForValue().get(key + ":result");
                if (cached != null) {
                    return om.readValue(cached, Object.class);
                }
            }
            throw new BizException(ResultCode.DUPLICATE_SUBMIT,
                    "操作过于频繁，请勿重复提交（" + idem.seconds() + " 秒内只能提交一次）");
        }

        try {
            Object result = pjp.proceed();

            if (idem.returnCache()) {
                // 把结果缓存下来，供窗口内的重复请求复用
                redis.opsForValue().set(key + ":result",
                        om.writeValueAsString(result),
                        Duration.ofSeconds(idem.seconds()));
            }
            return result;

        } catch (BizException e) {
            // ★ 业务异常：**不释放**幂等占位。
            //
            // 为什么？这是本项目踩过的真实坑：
            //   "借阅已达上限"(30004) 这类业务失败，如果释放了占位，
            //   用户在 3 秒内重复点击会一路打进数据库（每次都做一遍校验），
            //   幂等形同虚设。
            //
            //   业务失败本身是"有效响应"，说明系统正确处理了这次请求，
            //   不应该允许在窗口内重复提交同一个请求。
            //
            //   反之若释放，攻击者只要构造"必然失败"的请求就能无限刷接口。
            throw e;

        } catch (Throwable e) {
            // ★ 系统级异常（数据库挂了、网络断了）：释放占位。
            //   这类异常没给人任何有效响应，用户重试是合理行为，
            //   不该因为"系统刚才自己坏了"而把用户锁住 3 秒。
            redis.delete(key);
            throw e;
        }
    }

    /**
     * 生成幂等 key。
     * 参数序列化后取 SHA-256 前 16 位 —— 够短且碰撞概率极低。
     */
    private String buildKey(ProceedingJoinPoint pjp, Idempotent idem) {
        String method = pjp.getSignature().toShortString();
        String suffix = idem.key().isEmpty() ? method : idem.key();

        Long user = UserContext.get();
        String who = user == null ? "anon:" + clientIp() : "user:" + user;

        String argHash;
        try {
            String args = om.writeValueAsString(Arrays.asList(pjp.getArgs()));
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(args.getBytes(StandardCharsets.UTF_8));
            argHash = HexFormat.of().formatHex(digest, 0, 8);   // 前 8 字节 = 16 个十六进制字符
        } catch (Exception e) {
            argHash = "nohash";
        }

        return "idem:" + suffix + ":" + who + ":" + argHash;
    }

    private String clientIp() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) return "unknown";
        var req = attrs.getRequest();
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return req.getRemoteAddr();
    }
}

package com.bookhub.common;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collections;
import java.util.UUID;

/**
 * Redis 分布式锁 —— 正确实现的完整版本。
 *
 * <pre>
 * 为什么需要分布式锁？
 *   本地 synchronized 只能锁住"一个 JVM 内的线程"。
 *   一旦部署两台服务器，两边的 synchronized 互不相识，
 *   用户 A 在节点 1 下单、用户 B 在节点 2 下单，照样超卖。
 *
 *   分布式锁把"互斥"这件事放到一个所有节点都能看到的地方 —— Redis。
 *
 * ────────────────────────────────────────────────────────────
 * 一个"正确"的分布式锁必须同时满足这五点（少一个都会出事）：
 *
 *   ① 加锁要原子：SET key value NX PX ttl
 *      反例：先 exists 判断再 set —— 两条命令之间有窗口，两个客户端都能通过。
 *
 *   ② value 必须唯一（UUID），标识"这把锁是我的"
 *      反例：所有客户端写同一个 value "1" —— 无法区分是谁的锁。
 *
 *   ③ 解锁要原子：Lua 脚本"比较 value 再删除"
 *      反例：if (get(key).equals(myId)) del(key) —— 判断与删除之间可能过期，
 *            删掉的是别人的锁。
 *
 *   ④ 必须有超时（PX），否则持有者崩溃 → 锁永远不释放 → 死锁。
 *
 *   ⑤ 超时时间要合理：太短 → 业务没做完锁就没了；太长 → 崩溃后要等很久。
 *      （生产级方案用"看门狗"自动续期，如 Redisson）
 * ────────────────────────────────────────────────────────────
 *
 * 本实现覆盖 ①~⑤ 的核心，但不含看门狗续期 ——
 * 对"借书"这种毫秒级操作足够；长任务请用 Redisson。
 * </pre>
 */
@Component
public class RedisLock {

    private final StringRedisTemplate redis;

    /** 解锁脚本：只有 value 匹配才删除。返回 1 表示删成功，0 表示锁已不属于我 */
    private static final DefaultRedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('del', KEYS[1]) " +
            "else " +
            "  return 0 " +
            "end",
            Long.class
    );

    /** 续期脚本：只有 value 匹配才延长 TTL */
    private static final DefaultRedisScript<Long> RENEW_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('pexpire', KEYS[1], ARGV[2]) " +
            "else " +
            "  return 0 " +
            "end",
            Long.class
    );

    public RedisLock(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * 尝试加锁（不阻塞）。
     *
     * @return 锁令牌；null 表示没抢到
     */
    public String tryLock(String key, Duration ttl) {
        String token = UUID.randomUUID().toString();
        Boolean ok = redis.opsForValue().setIfAbsent(key, token, ttl);
        return Boolean.TRUE.equals(ok) ? token : null;
    }

    /**
     * 阻塞加锁：在 waitMillis 内自旋重试。
     *
     * <pre>
     * 为什么用"自旋 + 随机退避"而不是"固定间隔"？
     *   固定间隔会让多个等待者同时醒来抢锁（惊群），白白消耗 CPU 和网络。
     *   加一点随机抖动能错开唤醒时机。
     * </pre>
     */
    public String lock(String key, Duration ttl, long waitMillis) throws InterruptedException {
        long deadline = System.currentTimeMillis() + waitMillis;
        while (System.currentTimeMillis() < deadline) {
            String token = tryLock(key, ttl);
            if (token != null) return token;
            // 20~60ms 随机退避
            Thread.sleep(20 + (long) (Math.random() * 40));
        }
        return null;
    }

    /** 解锁。返回 true 表示确实是我释放的 */
    public boolean unlock(String key, String token) {
        if (token == null) return false;
        Long r = redis.execute(UNLOCK_SCRIPT, Collections.singletonList(key), token);
        return r != null && r == 1L;
    }

    /** 续期（看门狗的简化版，需要业务方定时调用） */
    public boolean renew(String key, String token, Duration ttl) {
        if (token == null) return false;
        Long r = redis.execute(RENEW_SCRIPT, Collections.singletonList(key),
                token, String.valueOf(ttl.toMillis()));
        return r != null && r == 1L;
    }

    /**
     * 模板方法：自动加锁/解锁，业务代码只关心主体。
     *
     * <pre>
     * 用法：
     *   lock.run("lock:book:1", Duration.ofSeconds(5), () -> {
     *       // 这段代码在锁保护下执行
     *       return doBorrow();
     *   });
     *
     * 注意 finally 里必须解锁 —— 否则抛异常就永久占锁。
     * </pre>
     */
    public <T> T run(String key, Duration ttl, LockedAction<T> action) {
        String token = tryLock(key, ttl);
        if (token == null) {
            throw new BizException(ResultCode.BOOK_BUSY, "该图书正在被其他读者借阅，请稍后重试");
        }
        try {
            return action.run();
        } finally {
            unlock(key, token);
        }
    }

    @FunctionalInterface
    public interface LockedAction<T> {
        T run();
    }
}

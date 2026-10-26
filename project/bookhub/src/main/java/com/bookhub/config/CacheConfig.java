package com.bookhub.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.boot.autoconfigure.cache.RedisCacheManagerBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

/**
 * Redis 缓存序列化配置 —— 让 @Cacheable 真正可用。
 *
 * <pre>
 * ══════════════════════════════════════════════════════════════
 *  这个问题必须记下来：Spring Boot 默认的缓存序列化不能用
 * ══════════════════════════════════════════════════════════════
 *
 * 现象：加了 @Cacheable 之后接口 500，日志报
 *     SerializationException: Cannot serialize
 *     at JdkSerializationRedisSerializer.serialize
 *
 * 原因：
 *   Spring Boot 的 RedisCacheManager 默认用 JdkSerializationRedisSerializer，
 *   它要求被缓存的对象 implements java.io.Serializable。
 *   而本项目的 VO 用的是 record：
 *
 *     public record BookDetailVO(Long id, String title, ...) { }
 *
 *   record 是隐式 final 的，**不会自动实现 Serializable** ——
 *   于是序列化直接抛异常。
 *
 * 为什么不用"给 record 加 implements Serializable"这个方案？
 *   ① 不彻底：以后每个 VO 都要记得加，忘一个就崩一个
 *   ② Jdk 序列化写进 Redis 是一堆二进制乱码，redis-cli 里完全无法排查
 *   ③ 跨语言不兼容（Python/Go 的服务读不了）
 *   ④ Jdk 序列化有历史反序列化漏洞（虽然缓存是自己写的，但仍是坏习惯）
 *
 * 正解：换成 JSON 序列化（GenericJackson2JsonRedisSerializer）。
 *   好处：record 能序列化、redis-cli 里可读、跨语言、更安全。
 * ══════════════════════════════════════════════════════════════
 * </pre>
 */
@Configuration
public class CacheConfig {

    /**
     * 定制 RedisCacheManager 的序列化器。
     *
     * <pre>
     * 三个序列化器的分工：
     *   key   → StringRedisSerializer（纯字符串，KEYS 能匹配）
     *   value → GenericJackson2JsonRedisSerializer（JSON，人能读）
     *   hash  → 同上
     *
     * ⚠️ 关于类型信息（activateDefaultTyping）：
     *   JSON 序列化后存进去是没有类型信息的 {"id":1,...}，
     *   反序列化时不知道原类型 → 只能返回 LinkedHashMap，强转会 ClassCastException。
     *
     *   所以必须开启默认类型信息，让 JSON 里带上 @class 字段：
     *     {"@class":"com.bookhub.vo.BookDetailVO","id":1,...}
     *
     *   这听上去和"跨语言可读"矛盾 —— 确实是妥协：
     *   · 要"任何人能读" → 不带类型，但 Java 侧反序列化困难
     *   · 要"Java 能还原对象" → 带类型，字段多一个 @class
     *
     *   本项目选后者（带类型），因为主要用途是 Java 内部缓存。
     *   如果要做多语言共享，应该用 StringRedisTemplate 手动存 JSON 字符串。
     * </pre>
     */
    @Bean
    public RedisCacheManagerBuilderCustomizer redisCacheManagerCustomizer() {
        ObjectMapper om = new ObjectMapper();
        om.registerModule(new JavaTimeModule());
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        // 允许所有类型带类型信息（本地学习环境足够；生产应收紧白名单）
        //
        // ⚠️ 必须用 EVERYTHING 而不是 NON_FINAL：
        //    NON_FINAL 写入时对 Object 用普通对象格式，读时却期望
        //    ["com.bookhub.vo.BookDetailVO", {...}] 的 WRAPPER_ARRAY 格式 →
        //    报 "expected START_ARRAY: need Array value to contain As.WRAPPER_ARRAY"。
        //
        //    EVERYTHING 让写入与读取两侧格式一致，彻底避免这种
        //    "能写不能读"的半坏状态。
        om.activateDefaultTyping(
                BasicPolymorphicTypeValidator.builder()
                        .allowIfBaseType(Object.class)
                        .build(),
                ObjectMapper.DefaultTyping.EVERYTHING,
                com.fasterxml.jackson.annotation.JsonTypeInfo.As.WRAPPER_ARRAY
        );

        GenericJackson2JsonRedisSerializer valueSer = new GenericJackson2JsonRedisSerializer(om);
        StringRedisSerializer keySer = new StringRedisSerializer();

        RedisCacheConfiguration conf = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(5))
                .disableCachingNullValues()          // 不缓存 null，防缓存穿透被 null 占满
                .prefixCacheNameWith("bookhub:cache:")
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(keySer))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(valueSer));

        return builder -> builder.cacheDefaults(conf);
    }
}

package com.bookhub.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 配置 —— 开启声明式缓存 + 定制序列化。
 *
 * <pre>
 * 为什么必须定制序列化？
 *   Spring Boot 默认的 JdkSerializationRedisSerializer 会把对象序列化成一串
 *   二进制乱码，redis-cli 里看到的是 \xac\xed\x00\x05... 完全无法排查。
 *   而且被缓存的类必须 implements Serializable。
 *
 *   用 JSON 序列化后，redis-cli 里直接能看到 {"id":1,"title":"..."}，
 *   排查问题、手动改值、跨语言共享都方便得多。
 *
 * 三个关键点：
 *   ① key 用 String 序列化（否则 key 也会变成二进制）
 *   ② value 用 JSON 序列化（可读、跨语言）
 *   ③ 注册 JavaTimeModule（否则 LocalDateTime/LocalDate 序列化会失败）
 * </pre>
 */
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);

        // key：纯字符串，方便 redis-cli 查看与 KEYS 匹配
        StringRedisSerializer keySer = new StringRedisSerializer();

        // value：JSON，注册 JSR310 以支持 java.time 类型
        ObjectMapper om = new ObjectMapper();
        om.registerModule(new JavaTimeModule());
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        // 不写入类型信息，避免不同包路径下反序列化失败
        GenericJackson2JsonRedisSerializer valueSer = new GenericJackson2JsonRedisSerializer(om);

        template.setKeySerializer(keySer);
        template.setHashKeySerializer(keySer);
        template.setValueSerializer(valueSer);
        template.setHashValueSerializer(valueSer);
        template.afterPropertiesSet();
        return template;
    }

    /** 纯字符串模板：用于计数器、分布式锁、限流等只需存数字/短串的场景 */
    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }
}

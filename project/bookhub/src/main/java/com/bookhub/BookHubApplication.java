package com.bookhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * BookHub 启动类。
 *
 * <pre>
 * 知识点位置：
 *   @SpringBootApplication  = @SpringBootConfiguration + @EnableAutoConfiguration + @ComponentScan
 *   详见 notes/07-springboot/01-概念卡.md「自动配置三要素」
 * </pre>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class BookHubApplication {
    public static void main(String[] args) {
        SpringApplication.run(BookHubApplication.class, args);
    }
}

package com.bookhub.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 跨域配置。
 *
 * <pre>
 * 为什么需要它（notes/java-engineering/02-http + web-frontend/05-ajax）：
 *   前端跑在 localhost:5173，后端在 localhost:8080 —— 端口不同 = 不同源。
 *   浏览器会拦截 JS 读取响应，除非服务端明确返回 CORS 头。
 *
 * 三个致命细节：
 *   ① allowCredentials(true) 时，allowedOrigins 不能是 "*"
 *      → 必须用 allowedOriginPatterns，或写具体域名
 *   ② OPTIONS 预检请求不带业务凭证 → 鉴权拦截器必须放行 OPTIONS
 *   ③ maxAge 要设，否则每个非简单请求都要先发一次 OPTIONS（请求翻倍）
 * </pre>
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                // 开发环境：允许任意 localhost 端口
                .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*")
                // 生产环境应写死具体域名：
                // .allowedOrigins("https://yourdomain.com")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("X-Trace-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}

package com.bookhub.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 新增/修改图书的请求体（DTO）。
 *
 * <pre>
 * 为什么用 record？
 *   1. 不可变：请求参数拿到后不应被业务代码改写
 *   2. 少写 200 行 getter/setter
 *   3. Jackson 3.x + record 原生支持反序列化（Spring Boot 3 已内置）
 *
 * 校验注解来自 jakarta.validation（注意是 jakarta 不是 javax！Spring Boot 3 用 jakarta）
 *   @NotBlank  字符串非 null 且去空格后长度 > 0
 *   @NotNull   任意类型非 null（数字、对象）
 *   @Size      长度区间
 *   @Min/@Max  数值区间
 *   @DecimalMin 小数比较
 *   message 里写中文，会直接展示给用户 —— 这就是"校验信息即产品文案"
 *
 * 校验生效的三个必要条件（缺一个就不生效，这是最高频的坑）：
 *   ① 参数上加 @Valid 或 @Validated
 *   ② 参数是 @RequestBody（或 @ModelAttribute）
 *   ③ classpath 有 spring-boot-starter-validation
 * </pre>
 */
public record BookCreateDTO(

        @NotBlank(message = "书名不能为空")
        @Size(max = 200, message = "书名最多 200 字")
        String title,

        @NotBlank(message = "作者不能为空")
        @Size(max = 100, message = "作者最多 100 字")
        String author,

        @Size(max = 20, message = "ISBN 最多 20 位")
        String isbn,

        @NotNull(message = "必须指定分类")
        Long categoryId,

        @NotNull(message = "价格不能为空")
        @DecimalMin(value = "0.00", message = "价格不能为负")
        BigDecimal price,

        @NotNull(message = "总藏书量不能为空")
        @Min(value = 0, message = "总藏书量不能为负")
        Integer total,

        Integer status,

        @Size(max = 500, message = "简介最多 500 字")
        String remark
) {
}

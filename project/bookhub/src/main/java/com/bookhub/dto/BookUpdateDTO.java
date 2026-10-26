package com.bookhub.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 修改图书的请求体（DTO）。
 *
 * <pre>
 * 为什么不复用 BookCreateDTO？
 *   新增和修改的校验规则常常不同：
 *     - 新增：title 必填
 *     - 修改：如果前端只传部分字段（PATCH 语义），title 就不该必填
 *
 * 本项目采用 PUT 全量替换语义（前端总是提交完整表单），
 * 所以校验规则与新增一致，但类型独立 —— 因为将来它们会分道扬镳。
 *
 * 这是接口设计的一个真实取舍：
 *   复用 → 省代码，但字段一改就牵连两处
 *   独立 → 多一点代码，但各自演进互不影响
 * </pre>
 */
public record BookUpdateDTO(

        @NotBlank(message = "书名不能为空")
        @Size(max = 200, message = "书名最多 200 字")
        String title,

        @NotBlank(message = "作者不能为空")
        @Size(max = 100, message = "作者最多 100 字")
        String author,

        @Size(max = 20, message = "ISBN 最多 20 位")
        String isbn,

        Long categoryId,

        @DecimalMin(value = "0.00", message = "价格不能为负")
        BigDecimal price,

        @Min(value = 0, message = "总藏书量不能为负")
        Integer total,

        Integer status,

        @Size(max = 500, message = "简介最多 500 字")
        String remark
) {
}

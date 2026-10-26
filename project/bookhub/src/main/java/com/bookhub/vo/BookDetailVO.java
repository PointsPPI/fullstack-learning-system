package com.bookhub.vo;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 图书详情 VO —— 比列表 VO 多带一些字段（如简介、更新时间、借阅统计）。
 *
 * <pre>
 * 为什么列表和详情要分成两个 VO？
 *   列表页一屏 10 条，每条只需要 7 个字段。
 *   如果列表也返回 remark（500 字） + 统计数字，10 条就是 5KB+ 的无用流量。
 *   真实项目里，"列表瘦、详情胖"是默认设计。
 *   这就是接口设计中的「按场景定制视图」，也是 VO 存在的意义。
 * </pre>
 */
public record BookDetailVO(
        Long id,
        String title,
        String author,
        String isbn,
        Long categoryId,
        String categoryName,
        BigDecimal price,
        Integer stock,
        Integer total,
        Integer status,
        String statusText,
        boolean available,
        String remark,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /** 累计借阅次数 —— 联表 COUNT 得出 */
        int borrowCount,
        /** 当前在借数量 */
        int borrowingCount
) {
}

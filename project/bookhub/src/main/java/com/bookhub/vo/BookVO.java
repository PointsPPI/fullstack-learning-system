package com.bookhub.vo;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 图书视图对象（VO）—— 专门给前端看的形状。
 *
 * <pre>
 * 和 Entity 的差别（这就是"解耦"最直观的一课）：
 *
 *   Entity.book              VO.book
 *   ─────────────            ─────────────
 *   categoryId: 1            categoryName: "计算机"   ← 联表查出来的，前端不用再查
 *   stock: 3                 available: true          ← 计算字段，前端不用算
 *   status: 1                statusText: "上架"        ← 枚举翻译，前端不用维护字典
 *   remark: "..."            (保留)
 *   createdAt/updatedAt      (不下发，前端用不到)
 *
 * 这样做的好处：
 *   1. 前端逻辑极薄 —— 拿到就能渲染，不需要自己拼装
 *   2. 数据库改字段不会击穿 API（改 Entity 内部映射即可）
 *   3. 敏感字段天然不泄露（不写进 VO 就等于不下发）
 *
 * 用 record：VO 是只读快照，不该被修改 → record 语义完全契合。
 * </pre>
 */
public record BookVO(
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
        LocalDateTime createdAt
) {
}

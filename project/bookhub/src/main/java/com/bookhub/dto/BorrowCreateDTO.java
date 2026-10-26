package com.bookhub.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 借书请求（DTO）。
 *
 * <pre>
 * 只接收 readerId —— bookId 从 URL 路径 {@code /api/books/{id}/borrow} 取。
 *
 * 为什么不接收 bookId？
 *   URL 里已经有了。让前端再传一遍 bookId 会产生"两个来源不一致"的问题：
 *   如果 URL 是 /books/1/borrow 但 body 写 {"bookId":2}，该信谁？
 *   → 同一个数据只能有一个权威来源（Single Source of Truth）。
 *
 * 为什么不接收 borrowDate / dueDate？
 *   借出日 = 服务端当前时间（不能信前端，否则可伪造）
 *   应还日 = 借出日 + 借期天数（业务规则在后端）
 *
 * 通用原则：「凡是可以由服务端计算/推导出来的，就不要让前端传」
 * </pre>
 */
public record BorrowCreateDTO(
        @NotNull(message = "readerId 不能为空") Long readerId
) {
}

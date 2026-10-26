package com.bookhub.vo;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * 借阅记录 VO —— 把 book 和 reader 的信息"摊平"成前端好用的形状。
 *
 * <pre>
 * 这一课是「关联查询 + 视图对象」的组合：
 *
 * 数据库里 borrow 表只有 book_id / reader_id（存的是 id）
 * 前端要显示的是「《活着》 - 张三 - 应还 2026-10-31 - 逾期 3 天」
 *
 * 谁来做这个转换？
 *   ❌ 前端做：要额外发 2 个请求拿书名和读者名 → N+1 查询问题
 *   ✅ 后端做：一条 JOIN SQL 全拿到，VO 里直接给成品字符串
 *
 * overdueDays / overdue 这些计算字段也放后端：
 *   前端算日期差要处理时区、夏令时、闰年 —— 后端用 java.time 一次算准。
 * </pre>
 */
public record BorrowVO(
        Long id,
        Long bookId,
        String bookTitle,
        String bookAuthor,
        Long readerId,
        String readerName,
        String readerCardNo,
        LocalDate borrowDate,
        LocalDate dueDate,
        LocalDate returnDate,
        Integer status,
        String statusText,
        boolean overdue,
        /** 已逾期天数（未逾期为 0） */
        long overdueDays,
        /** 剩余可借天数（已归还不适用，返回 null） */
        Long remainDays
) {
    /**
     * 静态工厂：从查询结果构造 VO，顺便算好所有派生字段。
     * 派生逻辑集中在这里，而不是散落在 Controller / 前端。
     */
    public static BorrowVO of(Long id, Long bookId, String bookTitle, String bookAuthor,
                              Long readerId, String readerName, String readerCardNo,
                              LocalDate borrowDate, LocalDate dueDate, LocalDate returnDate,
                              Integer status) {
        LocalDate today = LocalDate.now();
        boolean returned = returnDate != null || (status != null && status == 1);

        String statusText = switch (status == null ? -1 : status) {
            case 0 -> "借出中";
            case 1 -> "已归还";
            case 2 -> "逾期";
            default -> "未知";
        };

        boolean overdue;
        long overdueDays;
        Long remainDays;

        if (returned) {
            // 已归还：逾期与否看"归还日 vs 应还日"
            overdue = returnDate != null && returnDate.isAfter(dueDate);
            overdueDays = overdue ? ChronoUnit.DAYS.between(dueDate, returnDate) : 0;
            remainDays = null;
        } else {
            overdue = today.isAfter(dueDate);
            overdueDays = overdue ? ChronoUnit.DAYS.between(dueDate, today) : 0;
            remainDays = overdue ? 0L : ChronoUnit.DAYS.between(today, dueDate);
        }

        return new BorrowVO(id, bookId, bookTitle, bookAuthor, readerId, readerName, readerCardNo,
                borrowDate, dueDate, returnDate, status, statusText, overdue, overdueDays, remainDays);
    }
}

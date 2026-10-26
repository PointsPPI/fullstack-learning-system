package com.bookhub.mapper;

import com.bookhub.dto.BookQueryDTO;
import com.bookhub.dto.BookUpdateDTO;
import com.bookhub.entity.Book;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 图书持久层。
 *
 * <pre>
 * 分层职责（notes/data-access/04-layering）：
 *   Mapper 只做两件事：执行 SQL、映射结果。
 *   ❌ 不写业务判断（库存够不够、能不能借）
 *   ❌ 不拼装 VO（那是 Service 的事）
 *   ✅ 可以写"并发安全的条件"（如 WHERE stock > 0），因为它必须原子执行
 *
 * SQL 在 resources/mapper/BookMapper.xml，注解与 XML 两种方式并存：
 *   - 注解版：简单 SQL 直接写 @Select
 *   - XML 版：动态 SQL、复杂映射用 XML（本项目 XML 为主，便于阅读）
 * </pre>
 */
@Mapper
public interface BookMapper {

    /** 按 id 查（返回 Optional 语义由 Service 处理） */
    Book findById(@Param("id") Long id);

    /** 条件分页查询（动态 SQL） */
    List<Book> search(@Param("q") BookQueryDTO q);

    /** 条件查询总数（与 search 共用 where 片段，保证条件一致） */
    long countByCondition(@Param("q") BookQueryDTO q);

    /** 新增（回填自增主键） */
    int insert(Book book);

    /** 全量更新 */
    int update(@Param("id") Long id, @Param("d") BookUpdateDTO d);

    /** 删除 */
    int deleteById(@Param("id") Long id);

    /**
     * ★ 原子扣减库存 —— 并发安全的关键
     * 返回影响行数：0 表示库存不足（或图书不存在）。
     * 调用方必须判断返回值，不能只看"没抛异常"。
     */
    int decreaseStock(@Param("id") Long id);

    /** 归还时增加库存 */
    int increaseStock(@Param("id") Long id);

    /** ISBN 是否已存在（新增时唯一性校验） */
    boolean existsByIsbn(@Param("isbn") String isbn);

    /** 该图书是否还有未归还的记录（删除前校验） */
    boolean hasActiveBorrow(@Param("bookId") Long bookId);

    /** 批量查询各分类下的图书数量（用于详情页统计） */
    int countBorrowByBook(@Param("bookId") Long bookId);

    /** 当前在借数量 */
    int countBorrowing(@Param("bookId") Long bookId);
}

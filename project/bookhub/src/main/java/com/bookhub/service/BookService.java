package com.bookhub.service;

import com.bookhub.common.PageResult;
import com.bookhub.dto.BookCreateDTO;
import com.bookhub.dto.BookQueryDTO;
import com.bookhub.dto.BookUpdateDTO;
import com.bookhub.vo.BookDetailVO;
import com.bookhub.vo.BookVO;

/**
 * 图书业务接口。
 *
 * <pre>
 * 为什么要写接口（notes/data-access/04-layering）：
 *   · Controller 依赖接口而非实现 → 可替换、可 Mock 测试
 *   · 契约集中在这里，看接口就知道有哪些能力
 *   · 多个实现时（如加缓存版本）可以通过 @Primary 切换
 *   · 但注意：如果永远只有一个实现，接口确实会增加一层间接。
 *     这是"可测试性 vs 简洁"的取舍，本项目选可测试性。
 * </pre>
 */
public interface BookService {

    PageResult<BookVO> page(BookQueryDTO query);

    BookDetailVO detail(Long id);

    Long create(BookCreateDTO dto);

    void update(Long id, BookUpdateDTO dto);

    void delete(Long id);
}

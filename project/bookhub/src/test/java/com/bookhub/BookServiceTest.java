package com.bookhub;

import com.bookhub.common.PageResult;
import com.bookhub.dto.BookCreateDTO;
import com.bookhub.dto.BookQueryDTO;
import com.bookhub.service.BookService;
import com.bookhub.vo.BookDetailVO;
import com.bookhub.vo.BookVO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Service 层集成测试。
 *
 * <pre>
 * 为什么用 @SpringBootTest 而不是纯单元测试？
 *   因为要验证 Service + MyBatis + H2 整条链路是否真的能工作。
 *   Mapper 是接口（MyBatis 动态代理），Mock 它就测不出 SQL 是否正确。
 *
 * 为什么 @Transactional？
 *   每个测试方法跑在一个事务里，结束后自动回滚。
 *   → 测试之间互不污染，测试数据不会真的写进库。
 *   注意：这也意味着测试里看不到"事务提交后的状态"，
 *        如果需要验证提交行为，要加 @Commit 或去掉 @Transactional。
 * </pre>
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BookServiceTest {

    @Autowired
    private BookService bookService;

    @Test
    @DisplayName("分页查询：返回正确的总数、页数、分类名")
    void page_shouldReturnPagedResultWithCategoryName() {
        BookQueryDTO q = new BookQueryDTO();
        q.setPage(1);
        q.setSize(5);

        PageResult<BookVO> r = bookService.page(q);

        assertThat(r.total()).isEqualTo(12);
        assertThat(r.list()).hasSize(5);
        assertThat(r.pages()).isEqualTo(3);
        assertThat(r.hasNext()).isTrue();
        // 分类名是联表/批量查出来的，不是前端补的
        assertThat(r.list()).allSatisfy(vo -> assertThat(vo.categoryName()).isNotBlank());
    }

    @Test
    @DisplayName("分页查询：关键词过滤只匹配书名或作者")
    void page_shouldFilterByKeyword() {
        BookQueryDTO q = new BookQueryDTO();
        q.setKw("Java");

        PageResult<BookVO> r = bookService.page(q);

        assertThat(r.list()).isNotEmpty();
        assertThat(r.list()).allSatisfy(vo ->
                assertThat(vo.title() + vo.author()).containsIgnoringCase("Java"));
    }

    @Test
    @DisplayName("详情：计算字段与统计字段正确")
    void detail_shouldComputeDerivedFields() {
        BookDetailVO d = bookService.detail(1L);

        assertThat(d.title()).isEqualTo("深入理解计算机系统");
        assertThat(d.categoryName()).isEqualTo("计算机");
        assertThat(d.statusText()).isEqualTo("上架");
        assertThat(d.available()).isTrue();
        // 这本书有 1 条历史借阅记录（已归还）
        assertThat(d.borrowCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("详情：不存在时抛业务异常（而非返回 null）")
    void detail_notFound_shouldThrow() {
        assertThatThrownBy(() -> bookService.detail(99999L))
                .hasMessageContaining("图书不存在");
    }

    @Test
    @DisplayName("新增：初始库存等于总藏书量")
    void create_shouldInitStockToTotal() {
        BookCreateDTO dto = new BookCreateDTO(
                "测试书", "测试作者", "9780000000001", 1L,
                new BigDecimal("59.90"), 7, 1, "测试用"
        );

        Long id = bookService.create(dto);
        BookDetailVO d = bookService.detail(id);

        assertThat(d.stock()).isEqualTo(7);
        assertThat(d.total()).isEqualTo(7);
        assertThat(d.available()).isTrue();
    }

    @Test
    @DisplayName("新增：ISBN 重复时拒绝")
    void create_duplicateIsbn_shouldThrow() {
        // 9787111544937 已存在于测试数据
        BookCreateDTO dto = new BookCreateDTO(
                "重复书", "作者", "9787111544937", 1L,
                new BigDecimal("10.00"), 1, 1, null
        );

        assertThatThrownBy(() -> bookService.create(dto))
                .hasMessageContaining("ISBN 已存在");
    }

    @Test
    @DisplayName("新增：分类不存在时拒绝")
    void create_badCategory_shouldThrow() {
        BookCreateDTO dto = new BookCreateDTO(
                "书", "作者", null, 999L,
                new BigDecimal("10.00"), 1, 1, null
        );

        assertThatThrownBy(() -> bookService.create(dto))
                .hasMessageContaining("分类不存在");
    }

    @Test
    @DisplayName("删除：还有未归还记录时拒绝")
    void delete_hasActiveBorrow_shouldThrow() {
        // book_id=2 有未归还记录（测试数据 id=2 的 borrow）
        assertThatThrownBy(() -> bookService.delete(2L))
                .hasMessageContaining("未归还");
    }

    @Test
    @DisplayName("删除：无未归还记录时成功")
    void delete_ok() {
        // 先新建一本（无借阅记录）
        Long id = bookService.create(new BookCreateDTO(
                "待删书", "作者", null, 1L, new BigDecimal("1.00"), 1, 1, null));

        bookService.delete(id);

        assertThatThrownBy(() -> bookService.detail(id))
                .hasMessageContaining("图书不存在");
    }

    @Test
    @DisplayName("分页：排序字段非法时回落到 id（防 ORDER BY 注入）")
    void page_illegalSort_shouldFallback() {
        BookQueryDTO q = new BookQueryDTO();
        q.setSortBy("id; DROP TABLE book; --");
        q.setSortDir("desc");

        // 不抛异常（被白名单拦下并回落），且查询正常返回
        PageResult<BookVO> r = bookService.page(q);
        assertThat(r.list()).isNotEmpty();
    }
}

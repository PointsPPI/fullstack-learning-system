package com.bookhub.service.impl;

import com.bookhub.common.BizException;
import com.bookhub.common.PageResult;
import com.bookhub.common.ResultCode;
import com.bookhub.dto.BookCreateDTO;
import com.bookhub.dto.BookQueryDTO;
import com.bookhub.dto.BookUpdateDTO;
import com.bookhub.entity.Book;
import com.bookhub.entity.Category;
import com.bookhub.mapper.BookMapper;
import com.bookhub.mapper.CategoryMapper;
import com.bookhub.service.BookService;
import com.bookhub.vo.BookDetailVO;
import com.bookhub.vo.BookVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 图书业务实现。
 *
 * <pre>
 * 这个类的三层意义（对应三个学习点）：
 *
 * ① 业务规则集中地（分层解耦）
 *    分类必须存在、ISBN 不能重复、初始库存 = 总藏书量 —— 全在这里，
 *    换任何入口（Web / 定时任务 / MQ）调这个方法，规则都一样。
 *
 * ② 事务边界（@Transactional）
 *    只在"必须原子"的方法上加，且异常用 BizException（RuntimeException）保证回滚。
 *
 * ③ DTO/Entity/VO 转换的唯一场所
 *    Controller 不转换（否则胖），Mapper 不转换（SQL 层不认识 VO）。
 *
 * 看到这里没有 SQL、没有 HttpServletRequest —— 这就是"业务层可移植"。
 * </pre>
 */
@Service
public class BookServiceImpl implements BookService {

    private static final Logger log = LoggerFactory.getLogger(BookServiceImpl.class);

    /** 排序字段白名单 —— 防 ORDER BY 注入（${} 必须校验） */
    private static final Set<String> ALLOWED_SORT =
            Set.of("id", "title", "author", "price", "stock", "created_at");
    private static final Set<String> ALLOWED_DIR = Set.of("asc", "desc");

    private final BookMapper bookMapper;
    private final CategoryMapper categoryMapper;

    /** 构造器注入：依赖不可变、单测可直接 new */
    public BookServiceImpl(BookMapper bookMapper, CategoryMapper categoryMapper) {
        this.bookMapper = bookMapper;
        this.categoryMapper = categoryMapper;
    }

    @Override
    public PageResult<BookVO> page(BookQueryDTO q) {
        // ① 白名单校验（${} 的唯一防线）
        String sortBy = ALLOWED_SORT.contains(q.getSortBy()) ? q.getSortBy() : "id";
        String sortDir = ALLOWED_DIR.contains(lower(q.getSortDir())) ? lower(q.getSortDir()) : "desc";
        q.setSortBy(sortBy);
        q.setSortDir(sortDir);

        // ② 先查总数（为 0 就不用查列表了，省一次查询）
        long total = bookMapper.countByCondition(q);
        if (total == 0) {
            return PageResult.empty(q.getPage(), q.getSize());
        }

        // ③ 查当前页
        List<Book> books = bookMapper.search(q);

        // ④ 批量取分类名 —— 一次查询代替 N 次（避免 N+1）
        Map<Long, String> catNames = categoryMapper.findAll().stream()
                .collect(Collectors.toMap(Category::getId, Category::getName));

        List<BookVO> list = books.stream()
                .map(b -> toVO(b, catNames.get(b.getCategoryId())))
                .toList();

        return PageResult.of(list, total, q.getPage(), q.getSize());
    }

    @Override
    @org.springframework.cache.annotation.Cacheable(
            value = "book:detail",
            key = "#id",
            unless = "#result == null"
    )
    public BookDetailVO detail(Long id) {
        // orElseThrow —— 业务主线清晰，不用层层 if-null
        Book b = bookMapper.findById(id);
        if (b == null) throw new BizException(ResultCode.BOOK_NOT_FOUND);

        Category c = categoryMapper.findById(b.getCategoryId());
        int borrowCount = bookMapper.countBorrowByBook(id);
        int borrowingCount = bookMapper.countBorrowing(id);

        return new BookDetailVO(
                b.getId(), b.getTitle(), b.getAuthor(), b.getIsbn(),
                b.getCategoryId(), c != null ? c.getName() : null,
                b.getPrice(), b.getStock(), b.getTotal(),
                b.getStatus(), statusText(b.getStatus()),
                available(b),
                b.getRemark(), b.getCreatedAt(), b.getUpdatedAt(),
                borrowCount, borrowingCount
        );
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @org.springframework.cache.annotation.CacheEvict(value = "book:detail", allEntries = true)
    public Long create(BookCreateDTO dto) {
        // 业务规则 ①：分类必须存在
        if (categoryMapper.findById(dto.categoryId()) == null) {
            throw new BizException(ResultCode.NOT_FOUND, "分类不存在：" + dto.categoryId());
        }

        // 业务规则 ②：ISBN 唯一（若有填）
        if (dto.isbn() != null && !dto.isbn().isBlank() && bookMapper.existsByIsbn(dto.isbn())) {
            throw new BizException(ResultCode.BOOK_ISBN_DUPLICATE);
        }

        Book book = new Book();
        book.setTitle(dto.title().trim());
        book.setAuthor(dto.author().trim());
        book.setIsbn(blankToNull(dto.isbn()));
        book.setCategoryId(dto.categoryId());
        book.setPrice(dto.price());
        book.setTotal(dto.total());
        // 业务规则 ③：初始可借库存 = 总藏书量
        book.setStock(dto.total());
        book.setStatus(dto.status() != null ? dto.status() : 1);
        book.setRemark(blankToNull(dto.remark()));

        bookMapper.insert(book);
        log.info("新增图书 id={} title={}", book.getId(), book.getTitle());
        return book.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @org.springframework.cache.annotation.CacheEvict(value = "book:detail", key = "#id")
    public void update(Long id, BookUpdateDTO dto) {
        Book exist = bookMapper.findById(id);
        if (exist == null) throw new BizException(ResultCode.BOOK_NOT_FOUND);

        // 改了 ISBN 才校验唯一性
        if (dto.isbn() != null && !dto.isbn().equals(exist.getIsbn())
                && !dto.isbn().isBlank() && bookMapper.existsByIsbn(dto.isbn())) {
            throw new BizException(ResultCode.BOOK_ISBN_DUPLICATE);
        }

        // 业务规则：调整总藏书量时，可借库存要同步调整（保持 stock <= total）
        if (dto.total() != null && dto.total() < exist.getStock()) {
            throw new BizException(ResultCode.PARAM_INVALID,
                    "总藏书量不能小于当前可借库存（" + exist.getStock() + "）");
        }

        bookMapper.update(id, dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @org.springframework.cache.annotation.CacheEvict(value = "book:detail", key = "#id")
    public void delete(Long id) {
        Book exist = bookMapper.findById(id);
        if (exist == null) throw new BizException(ResultCode.BOOK_NOT_FOUND);

        // 业务规则：还有未归还的不能删（数据完整性）
        if (bookMapper.hasActiveBorrow(id)) {
            throw new BizException(ResultCode.BOOK_HAS_BORROW);
        }

        bookMapper.deleteById(id);
    }

    /* ══════════ 私有转换方法 ══════════ */

    private BookVO toVO(Book b, String categoryName) {
        return new BookVO(
                b.getId(), b.getTitle(), b.getAuthor(), b.getIsbn(),
                b.getCategoryId(), categoryName,
                b.getPrice(), b.getStock(), b.getTotal(),
                b.getStatus(), statusText(b.getStatus()),
                available(b),
                b.getRemark(), b.getCreatedAt()
        );
    }

    private String statusText(Integer status) {
        return status != null && status == 1 ? "上架" : "下架";
    }

    private boolean available(Book b) {
        return b.getStatus() != null && b.getStatus() == 1
                && b.getStock() != null && b.getStock() > 0;
    }

    private String lower(String s) {
        return s == null ? null : s.toLowerCase();
    }

    private String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

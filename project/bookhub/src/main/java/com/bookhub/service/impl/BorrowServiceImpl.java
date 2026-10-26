package com.bookhub.service.impl;

import com.bookhub.common.BizException;
import com.bookhub.common.ResultCode;
import com.bookhub.entity.Book;
import com.bookhub.entity.Borrow;
import com.bookhub.entity.Reader;
import com.bookhub.mapper.BookMapper;
import com.bookhub.mapper.BorrowMapper;
import com.bookhub.mapper.ReaderMapper;
import com.bookhub.service.BorrowService;
import com.bookhub.vo.BorrowVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 借阅业务实现 —— 本项目的"业务复杂度高地"。
 *
 * <pre>
 * 借书这个操作涉及三张表、四条规则、一个事务：
 *   规则 ①：图书必须存在且已上架
 *   规则 ②：读者必须存在且未冻结
 *   规则 ③：读者当前借阅数不能超过 5 本
 *   规则 ④：库存必须 > 0（用 UPDATE ... WHERE stock > 0 保证原子）
 *   事务：扣库存 + 插记录必须同时成功
 *
 * 这个类最能体现"业务层不可替代"：
 *   · Controller 不该知道这些规则
 *   · Mapper 无法表达"借阅上限"这种跨表规则
 *   · 规则改（比如上限从 5 改成 10）只改这里一个常量
 * </pre>
 */
@Service
public class BorrowServiceImpl implements BorrowService {

    private static final Logger log = LoggerFactory.getLogger(BorrowServiceImpl.class);

    /** 借期天数（业务规则，改这里就生效） */
    private static final int BORROW_DAYS = 30;
    /** 单人最大借阅数 */
    private static final int MAX_BORROW = 5;

    private final BorrowMapper borrowMapper;
    private final BookMapper bookMapper;
    private final ReaderMapper readerMapper;

    public BorrowServiceImpl(BorrowMapper bm, BookMapper bookMapper, ReaderMapper rm) {
        this.borrowMapper = bm;
        this.bookMapper = bookMapper;
        this.readerMapper = rm;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public BorrowVO borrow(Long bookId, Long readerId) {
        // ── 规则 ① 图书校验 ──
        Book book = bookMapper.findById(bookId);
        if (book == null) throw new BizException(ResultCode.BOOK_NOT_FOUND);
        if (book.getStatus() == null || book.getStatus() != 1) {
            throw new BizException(ResultCode.BOOK_OFF_SHELF);
        }

        // ── 规则 ② 读者校验 ──
        Reader reader = readerMapper.findById(readerId);
        if (reader == null) throw new BizException(ResultCode.READER_NOT_FOUND);
        if (reader.getStatus() == null || reader.getStatus() != 1) {
            throw new BizException(ResultCode.READER_FROZEN);
        }

        // ── 规则 ③ 借阅上限 ──
        int active = borrowMapper.countActiveByReader(readerId);
        if (active >= MAX_BORROW) {
            throw new BizException(ResultCode.READER_BORROW_LIMIT);
        }

        // ── 规则 ④ 原子扣库存（关键！）──
        // 注意：不能写 if (book.getStock() > 0) {...}，那是"先查后改"，并发会超卖。
        // 必须让数据库在一条 UPDATE 里完成"判断 + 扣减"。
        int rows = bookMapper.decreaseStock(bookId);
        if (rows == 0) {
            throw new BizException(ResultCode.BOOK_STOCK_EMPTY);
        }

        // ── 建借阅记录 ──
        LocalDate today = LocalDate.now();
        Borrow b = new Borrow();
        b.setBookId(bookId);
        b.setReaderId(readerId);
        b.setBorrowDate(today);
        b.setDueDate(today.plusDays(BORROW_DAYS));
        b.setReturnDate(null);
        b.setStatus(0);
        borrowMapper.insert(b);

        log.info("借书成功 borrowId={} bookId={} readerId={}", b.getId(), bookId, readerId);

        return BorrowVO.of(b.getId(), bookId, book.getTitle(), book.getAuthor(),
                readerId, reader.getName(), reader.getCardNo(),
                b.getBorrowDate(), b.getDueDate(), null, 0);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public BorrowVO returnBook(Long borrowId) {
        Borrow b = borrowMapper.findById(borrowId);
        if (b == null) throw new BizException(ResultCode.BORROW_NOT_FOUND);
        if (b.getReturnDate() != null) {
            throw new BizException(ResultCode.BORROW_ALREADY_RETURNED);
        }

        // 条件更新：return_date IS NULL 才更新 → 防止并发重复归还（幂等）
        int rows = borrowMapper.markReturned(borrowId, LocalDate.now());
        if (rows == 0) {
            throw new BizException(ResultCode.BORROW_ALREADY_RETURNED);
        }

        // 归还库存（increaseStock 里也有 stock < total 保护，不会超出总数）
        bookMapper.increaseStock(b.getBookId());

        Book book = bookMapper.findById(b.getBookId());
        Reader reader = readerMapper.findById(b.getReaderId());

        log.info("还书成功 borrowId={} bookId={}", borrowId, b.getBookId());

        return BorrowVO.of(b.getId(), b.getBookId(),
                book != null ? book.getTitle() : null,
                book != null ? book.getAuthor() : null,
                b.getReaderId(),
                reader != null ? reader.getName() : null,
                reader != null ? reader.getCardNo() : null,
                b.getBorrowDate(), b.getDueDate(), LocalDate.now(), 1);
    }

    @Override
    public List<BorrowVO> list(Integer status, Long readerId) {
        List<Map<String, Object>> rows = borrowMapper.searchWithBookAndReader(status, readerId);
        return rows.stream().map(this::mapToVO).toList();
    }

    /** Map → VO：SQL 返回的是扁平行，这里组装成前端要的形状 */
    @SuppressWarnings("unchecked")
    private BorrowVO mapToVO(Map<String, Object> m) {
        return BorrowVO.of(
                toLong(m.get("id")),
                toLong(m.get("bookId")),
                (String) m.get("bookTitle"),
                (String) m.get("bookAuthor"),
                toLong(m.get("readerId")),
                (String) m.get("readerName"),
                (String) m.get("readerCardNo"),
                toLocalDate(m.get("borrowDate")),
                toLocalDate(m.get("dueDate")),
                toLocalDate(m.get("returnDate")),
                toInt(m.get("status"))
        );
    }

    private Long toLong(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    private Integer toInt(Object o) {
        return o == null ? null : ((Number) o).intValue();
    }

    private LocalDate toLocalDate(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d;
        if (o instanceof java.sql.Date d) return d.toLocalDate();
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().toLocalDate();
        return LocalDate.parse(String.valueOf(o).substring(0, 10));
    }
}

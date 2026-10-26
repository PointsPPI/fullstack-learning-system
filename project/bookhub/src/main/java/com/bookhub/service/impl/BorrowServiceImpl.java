package com.bookhub.service.impl;

import com.bookhub.common.BizException;
import com.bookhub.common.RedisLock;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 借阅业务实现 —— 生产级并发控制的完整示范。
 *
 * <pre>
 * ══════════════════════════════════════════════════════════════
 *  为什么"扣库存"需要三层防护？
 * ══════════════════════════════════════════════════════════════
 *
 * 第 1 层：数据库原子更新（WHERE stock > 0）
 *   作用：保证"不会扣成负数"。这是最后一道防线，最可靠。
 *   局限：高并发时大量请求排队等同一行锁，吞吐差；
 *        扣减失败发生在事务较后位置，前面的校验白做了。
 *
 * 第 2 层：Redis 分布式锁（key = lock:book:{id}）
 *   作用：把"同一本书的并发借阅"串行化，让大部分冲突在进数据库之前被挡住。
 *   好处：数据库压力骤降；冲突时快速失败，不占数据库连接。
 *
 * 第 3 层：Redis 库存预检（stock:book:{id}）
 *   作用：加锁之前先看"还有没有库存"，没有就直接拒绝。
 *   好处：连锁都不抢了，响应快一个数量级。
 *
 *   ⚠️ 三层缺一不可：
 *     只有第 1 层 → 热点行把数据库打爆
 *     只有第 2 层 → 锁过期或 Redis 挂掉时全靠数据库兜底
 *     只有第 3 层 → 计数器可能与真实库存不一致（Redis 不是权威）
 *
 *   核心原则：**Redis 是加速器，数据库是权威源。**
 *   任何"只在 Redis 里做"的判断，都必须有数据库兜底。
 * ══════════════════════════════════════════════════════════════
 * </pre>
 */
@Service
public class BorrowServiceImpl implements BorrowService {

    private static final Logger log = LoggerFactory.getLogger(BorrowServiceImpl.class);

    /** 借期天数（业务规则，改配置就生效） */
    @Value("${bookhub.borrow.days:30}")
    private int borrowDays;

    /** 单人最大借阅数 */
    @Value("${bookhub.borrow.max:5}")
    private int maxBorrow;

    /** 锁超时：够跑完一次借书，又不会因持有者崩溃而永久占锁 */
    @Value("${bookhub.borrow.lock-ttl-seconds:10}")
    private long lockTtlSeconds;

    private final BorrowMapper borrowMapper;
    private final BookMapper bookMapper;
    private final ReaderMapper readerMapper;
    private final RedisLock redisLock;
    private final StringRedisTemplate redis;

    public BorrowServiceImpl(BorrowMapper bm, BookMapper bookMapper, ReaderMapper rm,
                             RedisLock redisLock, StringRedisTemplate redis) {
        this.borrowMapper = bm;
        this.bookMapper = bookMapper;
        this.readerMapper = rm;
        this.redisLock = redisLock;
        this.redis = redis;
    }

    /* ============================================================
     * 借书
     * ============================================================ */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public BorrowVO borrow(Long bookId, Long readerId) {
        // ── 第 3 层：Redis 库存预检（最快，无锁）──
        // 缓存里没有 key 说明还没预热，交给数据库判断（不能因此误拒）
        String stockKey = stockKeyOf(bookId);
        String cachedStock = redis.opsForValue().get(stockKey);
        if (cachedStock != null && Integer.parseInt(cachedStock) <= 0) {
            throw new BizException(ResultCode.BOOK_STOCK_EMPTY);
        }

        // ── 第 2 层：分布式锁（串行化同一本书的并发借阅）──
        String lockKey = "lock:book:" + bookId;
        BorrowVO result = redisLock.run(lockKey, Duration.ofSeconds(lockTtlSeconds),
                () -> doBorrow(bookId, readerId));

        // ── 缓存一致性：事务提交后再刷新 ──
        refreshCacheAfterCommit(bookId);

        return result;
    }

    /** 真正的借书逻辑（在分布式锁保护下执行） */
    private BorrowVO doBorrow(Long bookId, Long readerId) {
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
        if (active >= maxBorrow) {
            throw new BizException(ResultCode.READER_BORROW_LIMIT);
        }

        // ── 第 1 层：数据库原子扣减（最终防线）──
        int rows = bookMapper.decreaseStock(bookId);
        if (rows == 0) {
            // 数据库说没库存 —— 顺便修正 Redis 里可能过时的计数
            redis.opsForValue().set(stockKeyOf(bookId), "0", Duration.ofMinutes(5));
            throw new BizException(ResultCode.BOOK_STOCK_EMPTY);
        }

        // ── 建借阅记录 ──
        LocalDate today = LocalDate.now();
        Borrow b = new Borrow();
        b.setBookId(bookId);
        b.setReaderId(readerId);
        b.setBorrowDate(today);
        b.setDueDate(today.plusDays(borrowDays));
        b.setReturnDate(null);
        b.setStatus(0);
        borrowMapper.insert(b);

        log.info("借书成功 borrowId={} bookId={} readerId={}", b.getId(), bookId, readerId);

        return BorrowVO.of(b.getId(), bookId, book.getTitle(), book.getAuthor(),
                readerId, reader.getName(), reader.getCardNo(),
                b.getBorrowDate(), b.getDueDate(), null, 0);
    }

    /* ============================================================
     * 还书
     * ============================================================ */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public BorrowVO returnBook(Long borrowId) {
        Borrow b = borrowMapper.findById(borrowId);
        if (b == null) throw new BizException(ResultCode.BORROW_NOT_FOUND);
        if (b.getReturnDate() != null) {
            throw new BizException(ResultCode.BORROW_ALREADY_RETURNED);
        }

        // 条件更新：return_date IS NULL 才更新 → 防并发重复归还（幂等）
        int rows = borrowMapper.markReturned(borrowId, LocalDate.now());
        if (rows == 0) {
            throw new BizException(ResultCode.BORROW_ALREADY_RETURNED);
        }

        bookMapper.increaseStock(b.getBookId());
        refreshCacheAfterCommit(b.getBookId());

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

    /* ============================================================
     * 查询
     * ============================================================ */
    @Override
    public List<BorrowVO> list(Integer status, Long readerId) {
        List<Map<String, Object>> rows = borrowMapper.searchWithBookAndReader(status, readerId);
        return rows.stream().map(this::mapToVO).toList();
    }

    /* ============================================================
     * 缓存维护
     * ============================================================ */

    private String stockKeyOf(Long bookId) {
        return "stock:book:" + bookId;
    }

    /**
     * 事务提交后刷新库存缓存。
     *
     * <pre>
     * 为什么必须在 afterCommit 里做？
     *   在事务中更新缓存 → 事务若回滚，缓存里留下的是脏数据。
     *   并发场景下，另一个线程还可能读到"未提交"的值（违反隔离性）。
     *
     * 这是 Cache Aside 模式的正确实现，面试高频考点。
     * </pre>
     */
    private void refreshCacheAfterCommit(Long bookId) {
        Runnable task = () -> {
            try {
                Book fresh = bookMapper.findById(bookId);
                if (fresh != null) {
                    // 5 分钟过期：库存变化频繁，不宜长缓存
                    redis.opsForValue().set(stockKeyOf(bookId),
                            String.valueOf(fresh.getStock()), Duration.ofMinutes(5));
                } else {
                    redis.delete(stockKeyOf(bookId));
                }
            } catch (Exception e) {
                log.warn("刷新库存缓存失败 bookId={}", bookId, e);
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            task.run();
                        }
                    });
        } else {
            task.run();
        }
    }

    /* ============================================================
     * 转换
     * ============================================================ */

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

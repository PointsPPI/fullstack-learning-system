package com.bookhub.controller;

import com.bookhub.aspect.Idempotent;
import com.bookhub.aspect.RateLimit;
import com.bookhub.common.R;
import com.bookhub.dto.BorrowCreateDTO;
import com.bookhub.service.BorrowService;
import com.bookhub.vo.BorrowVO;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 借阅接口。
 *
 * <pre>
 * 这个类演示三种并发控制的**分工**（面试常问，也最容易混淆）：
 *
 *  ┌────────────┬──────────────────────┬─────────────────────────────┐
 *  │ 手段       │ 解决什么             │ 本项目用在哪                 │
 *  ├────────────┼──────────────────────┼─────────────────────────────┤
 *  │ @RateLimit │ 刷接口（同一人打太快）│ 借书：每分钟 20 次           │
 *  │ @Idempotent│ 重复提交（点两次）    │ 借书：3 秒内同请求只算一次   │
 *  │ 分布式锁   │ 并发争抢（多人同时抢）│ Service 内：按 bookId 串行   │
 *  └────────────┴──────────────────────┴─────────────────────────────┘
 *
 *  三者解决的问题完全不同，缺一个都会出事故：
 *    · 只有锁   → 用户可以疯狂重试，把锁排队排满
 *    · 只有幂等 → 不同用户同时抢同一本书，还是在数据库层撞车
 *    · 只有限流 → 双击提交依然会产生两条借阅记录
 * </pre>
 */
@RestController
@RequestMapping("/api")
public class BorrowController {

    private final BorrowService borrowService;

    public BorrowController(BorrowService borrowService) {
        this.borrowService = borrowService;
    }

    /**
     * 借书。
     *
     * <pre>
     * 三层拦截，从便宜到昂贵：
     *   ① @RateLimit  —— 最外层，先挡住"打太快"的人（只是 Redis INCR，极廉价）
     *   ② @Idempotent —— 中间层，挡住"重复提交"（要序列化参数算哈希，稍贵）
     *   ③ 分布式锁    —— 最内层，在 Service 里，处理真正的并发争抢
     *
     * 为什么这个顺序？
     *   把最便宜的检查放最外层，便宜的不通过就不做贵的检查 ——
     *   这是性能优化的通用原则（fail fast & cheap first）。
     * </pre>
     */
    @PostMapping("/books/{id}/borrow")
    @RateLimit(times = 20, seconds = 60, by = RateLimit.Dimension.IP, key = "borrow")
    @Idempotent(seconds = 3)
    public R<BorrowVO> borrow(@PathVariable Long id, @Valid @RequestBody BorrowCreateDTO dto) {
        return R.ok(borrowService.borrow(id, dto.readerId()));
    }

    /** 还书（也加幂等，防重复归还） */
    @PostMapping("/borrows/{id}/return")
    @Idempotent(seconds = 3)
    public R<BorrowVO> returnBook(@PathVariable Long id) {
        return R.ok(borrowService.returnBook(id));
    }

    /** 借阅记录列表 */
    @GetMapping("/borrows")
    public R<List<BorrowVO>> list(@RequestParam(required = false) Integer status,
                                  @RequestParam(required = false) Long readerId) {
        return R.ok(borrowService.list(status, readerId));
    }
}

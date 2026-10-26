package com.bookhub.controller;

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
 * 注意 /{id}/borrow 这种"动作式端点"：
 *   严格 REST 会说应该是 POST /borrows（新增一条借阅记录）。
 *   但"借书"是一个有副作用的业务动作，用 /books/{id}/borrow 更直观。
 *   REST 不是教条 —— 业务动作允许用动词。
 * </pre>
 */
@RestController
@RequestMapping("/api")
public class BorrowController {

    private final BorrowService borrowService;

    public BorrowController(BorrowService borrowService) {
        this.borrowService = borrowService;
    }

    /** 借书 */
    @PostMapping("/books/{id}/borrow")
    public R<BorrowVO> borrow(@PathVariable Long id, @Valid @RequestBody BorrowCreateDTO dto) {
        return R.ok(borrowService.borrow(id, dto.readerId()));
    }

    /** 还书 */
    @PostMapping("/borrows/{id}/return")
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

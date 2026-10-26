package com.bookhub.controller;

import com.bookhub.common.PageResult;
import com.bookhub.common.R;
import com.bookhub.dto.BookCreateDTO;
import com.bookhub.dto.BookQueryDTO;
import com.bookhub.dto.BookUpdateDTO;
import com.bookhub.service.BookService;
import com.bookhub.vo.BookDetailVO;
import com.bookhub.vo.BookVO;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * 图书接口 —— 整个类只有 60 行，因为它只做 HTTP 层的事。
 *
 * <pre>
 * Controller 的三条铁律（notes/data-access/04-layering）：
 *   ① 只接收参数、交给 Service、包装响应 —— 不写任何业务判断
 *   ② 不直接调 Mapper（越层）
 *   ③ 不 try-catch 业务异常（交给 @RestControllerAdvice）
 *
 * 对比"胖 Controller"版本：所有校验、SQL、事务都塞在这里，
 * 一个方法两百行，无法复用、无法测试。那个版本在
 * project/bookhub/docs/v1-fat-controller.md 里可以对照看。
 * </pre>
 */
@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    /** 构造器注入 —— 单构造器可省略 @Autowired */
    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    /**
     * 分页列表。
     * GET 没有请求体，查询参数由 Spring MVC 自动绑定到 DTO 的 setter。
     */
    @GetMapping
    public R<PageResult<BookVO>> list(@Valid BookQueryDTO query) {
        return R.ok(bookService.page(query));
    }

    /** 详情。@PathVariable 取 URL 里的 {id} */
    @GetMapping("/{id}")
    public R<BookDetailVO> detail(@PathVariable Long id) {
        return R.ok(bookService.detail(id));
    }

    /** 新增。201 Created + 返回新 id */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public R<Long> create(@Valid @RequestBody BookCreateDTO dto) {
        return R.ok(bookService.create(dto));
    }

    /** 全量更新 */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody BookUpdateDTO dto) {
        bookService.update(id, dto);
        return R.ok();
    }

    /** 删除。204 No Content（无响应体） */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        bookService.delete(id);
    }
}

package com.bookhub.common;

/**
 * 业务异常 —— 主动 throw 出去的"预料之中的错误"。
 *
 * <pre>
 * 为什么要有它，而不是到处 return R.fail()？
 *
 *   反例（业务异常当返回值）：
 *     public R<Book> get(long id) {
 *         Book b = mapper.findById(id);
 *         if (b == null) return R.fail(BOOK_NOT_FOUND);   // 每个方法都要写一遍
 *         return R.ok(b);
 *     }
 *     问题：1) 层层都要判空返回，Service 里塞满 if-return；
 *           2) 一半代码是"错误处理"，业务主线被淹没；
 *           3) 事务不会回滚（因为没抛异常，方法正常 return 了）。
 *
 *   正解（业务异常 + 全局异常处理器）：
 *     public Book get(long id) {
 *         return mapper.findById(id)
 *             .orElseThrow(() -> new BizException(BOOK_NOT_FOUND));  // 主线清爽
 *     }
 *     异常冒泡到 @RestControllerAdvice 统一转成 R.fail(...) ；
 *     同时 @Transactional 见到 RuntimeException → 自动回滚。
 *
 * 关键点：必须继承 RuntimeException（非受检），否则事务不回滚、代码到处 try-catch。
 * </pre>
 */
public class BizException extends RuntimeException {

    private final ResultCode resultCode;

    public BizException(ResultCode resultCode) {
        super(resultCode.getMessage());
        this.resultCode = resultCode;
    }

    public BizException(ResultCode resultCode, String message) {
        super(message);
        this.resultCode = resultCode;
    }

    public ResultCode getResultCode() {
        return resultCode;
    }
}

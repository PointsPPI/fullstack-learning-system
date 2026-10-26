package com.bookhub.common;

/**
 * 业务错误码枚举。
 *
 * <pre>
 * 设计要点（对应 notes/07-springboot/03-坑点清单.md）：
 *   1. 错误码分段：1xxxx=通用，2xxxx=图书，3xxxx=借阅，4xxxx=读者
 *   2. 错误码是【契约】：前端可能靠它做特殊处理（如 20001 → 提示"库存不足，去预约"）
 *   3. 新增错误码只能追加，不能改已有数字的含义
 * </pre>
 */
public enum ResultCode {

    SUCCESS(0, "成功"),

    // ---- 通用 1xxxx ----
    PARAM_INVALID(10001, "参数校验失败"),
    NOT_FOUND(10404, "资源不存在"),
    METHOD_NOT_ALLOWED(10405, "请求方法不支持"),
    SYSTEM_ERROR(15000, "系统繁忙，请稍后重试"),

    // ---- 图书 2xxxx ----
    BOOK_NOT_FOUND(20001, "图书不存在"),
    BOOK_STOCK_EMPTY(20002, "该书暂无可借库存"),
    BOOK_OFF_SHELF(20003, "该书已下架"),
    BOOK_ISBN_DUPLICATE(20004, "ISBN 已存在"),
    BOOK_HAS_BORROW(20005, "该图书仍有未归还记录，不能删除"),

    // ---- 并发控制 1.5xxxx ----
    TOO_MANY_REQUESTS(10501, "请求过于频繁，请稍后再试"),
    DUPLICATE_SUBMIT(10502, "请勿重复提交"),

    // ---- 借阅 3xxxx ----
    BORROW_NOT_FOUND(30001, "借阅记录不存在"),
    BORROW_ALREADY_RETURNED(30002, "该记录已归还，不能重复归还"),
    READER_FROZEN(30003, "读者账号已冻结"),
    READER_BORROW_LIMIT(30004, "已达最大借阅数量（5 本）"),
    BOOK_BUSY(30005, "该图书正在被其他读者借阅，请稍后重试"),

    // ---- 代码执行 / 判题 5xxxx ----
    CODE_TOO_LONG(50001, "代码长度超过限制"),
    CODE_COMPILE_ERROR(50002, "编译失败"),
    CODE_RUNTIME_ERROR(50003, "运行出错"),
    CODE_TIMEOUT(50004, "运行超时（可能存在死循环）"),
    CODE_OUTPUT_TOO_LARGE(50005, "输出内容过多"),
    SANDBOX_BUSY(50006, "判题机繁忙，请稍后再试"),
    PROBLEM_NOT_FOUND(50007, "题目不存在"),
    TESTCASE_NOT_FOUND(50008, "题目缺少测试用例"),

    // ---- 读者 4xxxx ----
    READER_NOT_FOUND(40001, "读者不存在"),
    READER_CARD_DUPLICATE(40002, "借书证号已存在");

    private final int code;
    private final String message;

    ResultCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}

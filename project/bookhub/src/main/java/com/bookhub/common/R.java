package com.bookhub.common;

/**
 * 统一响应包装 R —— 让前端只处理一种结构。
 *
 * <pre>
 * 为什么需要它？（对应 notes/09-layering/02-对比表.md）
 *   没有统一响应时：登录接口成功返回 {token}，失败返回 {msg}，列表接口返回 []，
 *   前端每个接口都要写不同的判断分支 → 越写越乱。
 *
 * 有了统一响应：
 *   { "code": 0, "message": "ok", "data": {...}, "timestamp": 1699999999 }
 *   前端只需判断 code === 0，成功取 data，失败弹 message。
 *
 * 这里的 code 是【业务码】，不是 HTTP 状态码，两者要分开：
 *   HTTP 200 + code 0      → 真成功
 *   HTTP 200 + code 40401  → 请求本身没错，是业务说"书不存在"
 *   HTTP 500 + code 50000  → 服务端真的崩了
 * </pre>
 *
 * @param <T> 业务数据类型
 */
public record R<T>(int code, String message, T data, long timestamp) {

    public static <T> R<T> ok(T data) {
        return new R<>(ResultCode.SUCCESS.getCode(), "ok", data, System.currentTimeMillis());
    }

    public static R<Void> ok() {
        return new R<>(ResultCode.SUCCESS.getCode(), "ok", null, System.currentTimeMillis());
    }

    public static <T> R<T> fail(ResultCode rc) {
        return new R<>(rc.getCode(), rc.getMessage(), null, System.currentTimeMillis());
    }

    public static <T> R<T> fail(ResultCode rc, String message) {
        return new R<>(rc.getCode(), message, null, System.currentTimeMillis());
    }

    /** 参数校验失败等场景：带字段级提示 */
    public static <T> R<T> fail(int code, String message, T detail) {
        return new R<>(code, message, detail, System.currentTimeMillis());
    }
}

package com.bookhub.common;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 全局异常处理器 —— 让所有异常都变成统一响应，前端永远不用猜。
 *
 * <pre>
 * @RestControllerAdvice = @ControllerAdvice + @ResponseBody
 *   作用：对本包下所有 @RestController 抛出的异常做统一拦截。
 *
 * 分层解耦的体现（notes/09-layering）：
 *   Controller 里一行 try-catch 都不用写；
 *   Service 里直接 throw BizException；
 *   错误如何变成 HTTP 响应，全部集中在这一个类里。
 *   → 想改"错误响应格式"？只改这一个文件，全项目生效。
 *
 * 处理顺序原则：越具体的异常越靠前（Spring 会选最匹配的方法）。
 * </pre>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 1. 业务异常：我们主动抛的，属于"预料之中" → HTTP 200，靠 code 区分 */
    @ExceptionHandler(BizException.class)
    public R<Void> handleBiz(BizException e, HttpServletRequest req) {
        log.warn("业务异常 uri={} code={} msg={}", req.getRequestURI(), e.getResultCode().getCode(), e.getMessage());
        return R.fail(e.getResultCode(), e.getMessage());
    }

    /** 2. @RequestBody + @Valid 校验失败 → 400，带上字段级错误详情 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<Map<String, String>> handleValid(MethodArgumentNotValidException e) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fe : e.getBindingResult().getFieldErrors()) {
            // 同一字段多个错误只留第一条，避免前端展示一团乱
            errors.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        return R.fail(ResultCode.PARAM_INVALID.getCode(), ResultCode.PARAM_INVALID.getMessage(), errors);
    }

    /** 3. 表单/查询参数绑定失败 */
    @ExceptionHandler(BindException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<Map<String, String>> handleBind(BindException e) {
        Map<String, String> errors = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors()
                .forEach(fe -> errors.putIfAbsent(fe.getField(), fe.getDefaultMessage()));
        return R.fail(ResultCode.PARAM_INVALID.getCode(), ResultCode.PARAM_INVALID.getMessage(), errors);
    }

    /** 4. 必填参数缺失 */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<Void> handleMissing(MissingServletRequestParameterException e) {
        return R.fail(ResultCode.PARAM_INVALID, "缺少必填参数：" + e.getParameterName());
    }

    /**
     * 请求体无法解析（JSON 语法错、编码错、类型不匹配）。
     *
     * <pre>
     * 这是联调最高频的 400 之一，常见三种：
     *   ① 前端发的不是合法 JSON（多了尾逗号、少了引号）
     *   ② 编码不是 UTF-8（Windows 终端 curl 传中文经常踩这个）
     *   ③ 类型不匹配（"price": "abc" 但字段是 BigDecimal）
     *
     * 注意：这里【不能】把 e.getMessage() 原样返回 ——
     * 它会带出内部的类名和字段路径（如 com.bookhub.dto.X["price"]），
     * 属于内部结构泄露。只给一句人能看懂的提示。
     * </pre>
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<Void> handleUnreadable(HttpMessageNotReadableException e) {
        log.warn("请求体解析失败：{}", e.getMessage());
        return R.fail(ResultCode.PARAM_INVALID,
                "请求体格式错误：请确认是合法 JSON 且使用 UTF-8 编码");
    }

    /** 5. 方法不支持（比如用 GET 请求 POST 接口） */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    public R<Void> handleMethod(HttpRequestMethodNotSupportedException e) {
        return R.fail(ResultCode.METHOD_NOT_ALLOWED, e.getMessage());
    }

    /** 6. 404 */
    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public R<Void> handleNoHandler(NoHandlerFoundException e) {
        return R.fail(ResultCode.NOT_FOUND, "接口不存在：" + e.getRequestURL());
    }

    /** 7. 兜底：任何未预料异常 → 500，日志打全栈，响应不暴露内部细节 */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<Void> handleAll(Exception e, HttpServletRequest req) {
        log.error("未捕获异常 uri={}", req.getRequestURI(), e);
        // 注意：不要把 e.getMessage() 直接返回给前端 —— 可能泄露表名、SQL、内网 IP
        return R.fail(ResultCode.SYSTEM_ERROR);
    }
}

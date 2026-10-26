package com.bookhub.common;

import java.util.List;

/**
 * 分页结果包装。
 *
 * <pre>
 * 为什么单独定义，而不是直接返回 PageHelper 的 PageInfo？
 *   1. PageInfo 字段多（十几个），前端用不到那么多
 *   2. 直接暴露框架类型 → 换分页方案时前端 API 要变
 *   3. 统一结构让前端只写一次分页组件
 *
 * 字段设计：
 *   list     当前页数据
 *   total    总记录数（前端算总页数用）
 *   page     当前页码（从 1 开始）
 *   size     每页大小
 *   pages    总页数（后端算好，前端不用再算）
 *   hasNext  是否有下一页（前端"加载更多"按钮用）
 * </pre>
 */
public record PageResult<T>(
        List<T> list,
        long total,
        int page,
        int size,
        int pages,
        boolean hasNext
) {
    public static <T> PageResult<T> of(List<T> list, long total, int page, int size) {
        int pages = size > 0 ? (int) Math.ceil((double) total / size) : 0;
        return new PageResult<>(list, total, page, size, pages, page < pages);
    }

    public static <T> PageResult<T> empty(int page, int size) {
        return new PageResult<>(List.of(), 0, page, size, 0, false);
    }
}

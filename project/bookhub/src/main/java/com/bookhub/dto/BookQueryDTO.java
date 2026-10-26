package com.bookhub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 图书列表查询条件（DTO）。
 *
 * <pre>
 * 为什么查询条件也做成对象？
 *   反例：public R<Page> list(String kw, Long catId, Integer status, int page, int size, String sort)
 *         → 参数 6 个以上，调用时容易传错位置；加一个筛选条件要改所有调用点。
 *
 *   正解：封装成对象，Spring MVC 会自动把 ?kw=&catId=&page= 绑定到字段上
 *         （GET 请求没有请求体，所以用 setter 绑定，不能用 record —— record 无 setter）
 *
 * ⚠️ 注意：这个类必须用 class 而非 record
 *    因为 GET 参数绑定依赖 setter。这是 record 在实际项目里的边界。
 *
 * 分页参数的取值边界必须限死：
 *   page 最小 1（否则 LIMIT 负数偏移算错）
 *   size 最大 100（否则前端传 size=1000000 直接把数据库拖死 —— 真实事故）
 * </pre>
 */
public class BookQueryDTO {

    /** 关键词：同时匹配书名/作者，模糊查询 */
    private String kw;

    private Long categoryId;

    /** 1=上架 0=下架 null=全部 */
    private Integer status;

    @Min(value = 1, message = "页码最小为 1")
    private Integer page = 1;

    @Min(value = 1, message = "每页至少 1 条")
    @Max(value = 100, message = "每页最多 100 条")
    private Integer size = 10;

    /** 排序字段白名单在 Service 里校验，绝不直接拼进 SQL（防注入） */
    private String sortBy = "id";

    private String sortDir = "desc";

    public String getKw() { return kw; }
    public void setKw(String kw) { this.kw = kw; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }

    public Integer getPage() { return page; }
    public void setPage(Integer page) { this.page = page; }

    public Integer getSize() { return size; }
    public void setSize(Integer size) { this.size = size; }

    public String getSortBy() { return sortBy; }
    public void setSortBy(String sortBy) { this.sortBy = sortBy; }

    public String getSortDir() { return sortDir; }
    public void setSortDir(String sortDir) { this.sortDir = sortDir; }

    /** 供 MyBatis 计算偏移量 */
    public int getOffset() {
        int p = page == null ? 1 : Math.max(page, 1);
        int s = size == null ? 10 : size;
        return (p - 1) * s;
    }
}

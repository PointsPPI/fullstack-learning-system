package com.bookhub.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 图书实体（Entity）—— 与数据库表 book 一一对应。
 *
 * <pre>
 * Entity / DTO / VO 三兄弟的区别（notes/09-layering/02-对比表.md）：
 *
 *   Entity        和表结构一一对应，字段 = 列。只在 Mapper ↔ Service 之间流动。
 *                 ⚠️ 不要把 Entity 直接返回给前端！
 *                   原因：1) 会暴露 remark、status 等内部字段
 *                        2) 表加字段会意外改变 API
 *                        3) 密码/手机号等敏感字段会泄露
 *
 *   DTO (Data Transfer Object)  接收前端请求参数，带校验注解。
 *   VO  (View Object)           返回给前端看的视图对象，可以拼接、脱敏、改名。
 *
 * 本项目用 Java 21 record 还是 class？
 *   Entity 必须用 class：MyBatis 需要无参构造 + setter 来反射赋值。
 *   DTO/VO 用 record：不可变、简洁、自动生成构造/getter/equals。
 * </pre>
 */
public class Book {

    private Long id;
    private String title;
    private String author;
    private String isbn;
    private Long categoryId;
    private BigDecimal price;
    private Integer stock;
    private Integer total;
    private Integer status;
    private String remark;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public String getIsbn() { return isbn; }
    public void setIsbn(String isbn) { this.isbn = isbn; }

    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public Integer getStock() { return stock; }
    public void setStock(Integer stock) { this.stock = stock; }

    public Integer getTotal() { return total; }
    public void setTotal(Integer total) { this.total = total; }

    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }

    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}

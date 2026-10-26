package com.bookhub.controller;

import com.bookhub.common.R;
import com.bookhub.entity.Category;
import com.bookhub.mapper.CategoryMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 分类接口。
 *
 * <pre>
 * ⚠️ 这里 Controller 直接调了 Mapper —— 是不是越层？
 *
 * 判断标准（notes/data-access/04-layering）：
 *   有没有业务逻辑？
 *     · 分类列表 = 纯查表，无规则、无事务、无转换 → 直连 Mapper 是可接受的
 *     · 如果将来要加"只返回有书的分类"这种规则 → 必须抽 Service
 *
 * 这是"分层是为了隔离变化，不是为了形式"的实例。
 * 教科书说"Controller 不能调 Mapper"，但机械遵守会产生一个只会转发的空 Service。
 * 关键是：知道自己在做什么取舍，并在有业务规则时及时重构。
 * </pre>
 */
@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryMapper categoryMapper;

    public CategoryController(CategoryMapper categoryMapper) {
        this.categoryMapper = categoryMapper;
    }

    @GetMapping
    public R<List<Category>> list() {
        return R.ok(categoryMapper.findAll());
    }
}

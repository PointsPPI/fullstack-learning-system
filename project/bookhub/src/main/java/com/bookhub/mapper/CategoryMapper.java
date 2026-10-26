package com.bookhub.mapper;

import com.bookhub.entity.Category;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 分类持久层。
 *
 * <pre>
 * 这里演示「注解 SQL」的用法 —— 简单查询不需要 XML。
 * 复杂查询（动态条件、多表关联）仍建议用 XML，见 BookMapper。
 * </pre>
 */
@Mapper
public interface CategoryMapper {

    @Select("SELECT id, name, code, sort_no FROM category ORDER BY sort_no, id")
    List<Category> findAll();

    @Select("SELECT id, name, code, sort_no FROM category WHERE id = #{id}")
    Category findById(Long id);

    @Select("SELECT COUNT(*) FROM category WHERE code = #{code}")
    int countByCode(String code);
}

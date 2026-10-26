package com.bookhub.mapper;

import com.bookhub.entity.Reader;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 读者持久层 */
@Mapper
public interface ReaderMapper {

    @Select("SELECT id, card_no, name, phone, status, created_at FROM reader WHERE id = #{id}")
    Reader findById(Long id);

    @Select("SELECT id, card_no, name, phone, status, created_at FROM reader ORDER BY id")
    List<Reader> findAll();

    @Select("SELECT COUNT(*) FROM reader WHERE card_no = #{cardNo}")
    int countByCardNo(@Param("cardNo") String cardNo);
}

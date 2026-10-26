package com.bookhub.mapper;

import com.bookhub.entity.Borrow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 借阅记录持久层 */
@Mapper
public interface BorrowMapper {

    Borrow findById(@Param("id") Long id);

    /** 列表：联表查书名、读者名（关联查询在 SQL 层完成，Service 不用 N+1） */
    List<Map<String, Object>> searchWithBookAndReader(@Param("status") Integer status,
                                                      @Param("readerId") Long readerId);

    int insert(Borrow borrow);

    /** 归还：只更新未归还的记录（幂等 + 并发安全） */
    int markReturned(@Param("id") Long id, @Param("returnDate") java.time.LocalDate returnDate);

    /** 读者当前未归还数量（借阅上限校验） */
    int countActiveByReader(@Param("readerId") Long readerId);
}

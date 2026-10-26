package com.bookhub.service;

import com.bookhub.vo.BorrowVO;

import java.util.List;

/** 借阅业务接口 */
public interface BorrowService {

    /** 借书：扣库存 + 建记录（一个事务） */
    BorrowVO borrow(Long bookId, Long readerId);

    /** 还书：加库存 + 标记归还（一个事务） */
    BorrowVO returnBook(Long borrowId);

    List<BorrowVO> list(Integer status, Long readerId);
}

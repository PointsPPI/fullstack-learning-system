-- ============================================================
-- BookHub 数据库结构 01-schema.sql
-- 幂等：可重复执行（DROP IF EXISTS → CREATE）
-- 学习点：见 notes/11-mysql-sql/
--   建表三要素：字段类型 / 约束 / 索引
--   外键 vs 逻辑外键（本项目用逻辑外键，理由见 03-坑点清单.md）
-- ============================================================

DROP TABLE IF EXISTS borrow;
DROP TABLE IF EXISTS book;
DROP TABLE IF EXISTS reader;
DROP TABLE IF EXISTS category;

-- ---------- 图书分类 ----------
CREATE TABLE category (
    id      BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    name    VARCHAR(50)  NOT NULL                COMMENT '分类名',
    code    VARCHAR(20)  NOT NULL                COMMENT '分类编码，业务唯一',
    sort_no INT          NOT NULL DEFAULT 0      COMMENT '排序号',
    PRIMARY KEY (id),
    UNIQUE KEY uk_category_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '图书分类';

-- ---------- 图书 ----------
CREATE TABLE book (
    id          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    title       VARCHAR(200)  NOT NULL                COMMENT '书名',
    author      VARCHAR(100)  NOT NULL                COMMENT '作者',
    isbn        VARCHAR(20)   DEFAULT NULL            COMMENT 'ISBN，可空',
    category_id BIGINT        NOT NULL                COMMENT '分类 id（逻辑外键）',
    price       DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '定价',
    stock       INT           NOT NULL DEFAULT 0      COMMENT '可借库存',
    total       INT           NOT NULL DEFAULT 0      COMMENT '总藏书量',
    status      TINYINT       NOT NULL DEFAULT 1      COMMENT '1=上架 0=下架',
    remark      VARCHAR(500)  DEFAULT NULL            COMMENT '简介',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_book_category (category_id),          -- 按分类查：关联查询必备
    KEY idx_book_title (title),                   -- 按书名查
    KEY idx_book_status_stock (status, stock)     -- 联合索引：可借图书列表（最左前缀）
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '图书';

-- ---------- 读者 ----------
CREATE TABLE reader (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    card_no    VARCHAR(20)  NOT NULL COMMENT '借书证号',
    name       VARCHAR(50)  NOT NULL COMMENT '姓名',
    phone      VARCHAR(20)  DEFAULT NULL COMMENT '手机号',
    status     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=正常 0=冻结',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_reader_card (card_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '读者';

-- ---------- 借阅记录 ----------
CREATE TABLE borrow (
    id          BIGINT   NOT NULL AUTO_INCREMENT,
    book_id     BIGINT   NOT NULL COMMENT '图书 id',
    reader_id   BIGINT   NOT NULL COMMENT '读者 id',
    borrow_date DATE     NOT NULL COMMENT '借出日',
    due_date    DATE     NOT NULL COMMENT '应还日',
    return_date DATE     DEFAULT NULL COMMENT '实际归还日，NULL=未还',
    status      TINYINT  NOT NULL DEFAULT 0 COMMENT '0=借出中 1=已归还 2=逾期',
    PRIMARY KEY (id),
    KEY idx_borrow_book (book_id),
    KEY idx_borrow_reader (reader_id),
    KEY idx_borrow_status_due (status, due_date)   -- 逾期扫描：联合索引
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '借阅记录';

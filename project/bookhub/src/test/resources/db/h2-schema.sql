-- H2 专用建表脚本（用于测试 profile）
-- 与 01-schema.sql 逻辑等价，去掉了 MySQL 特有的 ENGINE/CHARSET/COMMENT 语法
DROP TABLE IF EXISTS borrow;
DROP TABLE IF EXISTS book;
DROP TABLE IF EXISTS reader;
DROP TABLE IF EXISTS category;

CREATE TABLE category (
    id      BIGINT      NOT NULL AUTO_INCREMENT,
    name    VARCHAR(50) NOT NULL,
    code    VARCHAR(20) NOT NULL,
    sort_no INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uk_category_code UNIQUE (code)
);

CREATE TABLE book (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    title       VARCHAR(200)  NOT NULL,
    author      VARCHAR(100)  NOT NULL,
    isbn        VARCHAR(20)   DEFAULT NULL,
    category_id BIGINT        NOT NULL,
    price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock       INT           NOT NULL DEFAULT 0,
    total       INT           NOT NULL DEFAULT 0,
    status      TINYINT       NOT NULL DEFAULT 1,
    remark      VARCHAR(500)  DEFAULT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
CREATE INDEX idx_book_category ON book (category_id);
CREATE INDEX idx_book_title ON book (title);
CREATE INDEX idx_book_status_stock ON book (status, stock);

CREATE TABLE reader (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    card_no    VARCHAR(20) NOT NULL,
    name       VARCHAR(50) NOT NULL,
    phone      VARCHAR(20) DEFAULT NULL,
    status     TINYINT     NOT NULL DEFAULT 1,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_reader_card UNIQUE (card_no)
);

CREATE TABLE borrow (
    id          BIGINT NOT NULL AUTO_INCREMENT,
    book_id     BIGINT NOT NULL,
    reader_id   BIGINT NOT NULL,
    borrow_date DATE   NOT NULL,
    due_date    DATE   NOT NULL,
    return_date DATE   DEFAULT NULL,
    status      TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);
CREATE INDEX idx_borrow_book ON borrow (book_id);
CREATE INDEX idx_borrow_reader ON borrow (reader_id);
CREATE INDEX idx_borrow_status_due ON borrow (status, due_date);

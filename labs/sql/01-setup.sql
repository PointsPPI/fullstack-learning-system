-- ============================================================
-- sql_lab 练习库 —— 与 bookhub 业务库分离，随便改不怕
-- 用法：
--   mysql -ubh -pbh_pwd_2026 -h127.0.0.1 -P3307 --default-character-set=utf8mb4 sql_lab < labs/sql/01-setup.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS sql_lab DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE sql_lab;

DROP TABLE IF EXISTS emp;
DROP TABLE IF EXISTS dept;
DROP TABLE IF EXISTS salary_log;

-- ---------- 部门 ----------
CREATE TABLE dept (
    id       BIGINT      NOT NULL AUTO_INCREMENT,
    name     VARCHAR(50) NOT NULL,
    city     VARCHAR(50) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dept_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 员工 ----------
CREATE TABLE emp (
    id       BIGINT        NOT NULL AUTO_INCREMENT,
    name     VARCHAR(50)   NOT NULL,
    dept_id  BIGINT        DEFAULT NULL,       -- 故意允许 NULL（用于 LEFT JOIN 练习）
    salary   DECIMAL(10,2) NOT NULL DEFAULT 0,
    hire_date DATE         NOT NULL,
    manager_id BIGINT      DEFAULT NULL,       -- 自连接练习
    PRIMARY KEY (id),
    KEY idx_emp_dept (dept_id),
    KEY idx_emp_salary (salary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 调薪日志（用于窗口函数练习） ----------
CREATE TABLE salary_log (
    id      BIGINT        NOT NULL AUTO_INCREMENT,
    emp_id  BIGINT        NOT NULL,
    old_salary DECIMAL(10,2) NOT NULL,
    new_salary DECIMAL(10,2) NOT NULL,
    changed_at DATETIME   NOT NULL,
    PRIMARY KEY (id),
    KEY idx_log_emp (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 数据：4 个部门（其中"行政部"没有员工，用于 LEFT JOIN 验证）
-- ============================================================
INSERT INTO dept (id, name, city) VALUES
(1, '研发部', '北京'),
(2, '产品部', '上海'),
(3, '销售部', '广州'),
(4, '行政部', '北京');

INSERT INTO emp (id, name, dept_id, salary, hire_date, manager_id) VALUES
(1, '张伟',   1, 25000.00, '2019-03-15', NULL),   -- 研发总监（无上级）
(2, '李娜',   1, 18000.00, '2020-07-01', 1),
(3, '王强',   1, 15000.00, '2021-01-10', 1),
(4, '刘洋',   2, 20000.00, '2020-05-20', NULL),   -- 产品总监
(5, '陈静',   2, 14000.00, '2022-02-14', 4),
(6, '杨帆',   3, 12000.00, '2021-09-01', NULL),   -- 销售总监
(7, '赵敏',   3, 11000.00, '2022-06-15', 6),
(8, '孙磊',   3, 13000.00, '2021-11-20', 6),
(9, '周涛',   1, 16000.00, '2023-03-01', 1),
(10, '吴桐', NULL, 9000.00, '2023-08-01', NULL);  -- 没分配部门（重点！）

INSERT INTO salary_log (emp_id, old_salary, new_salary, changed_at) VALUES
(2, 15000.00, 18000.00, '2023-01-01 10:00:00'),
(3, 12000.00, 15000.00, '2023-01-01 10:05:00'),
(7,  9000.00, 11000.00, '2023-07-01 09:00:00'),
(8, 11000.00, 13000.00, '2023-07-01 09:10:00'),
(9, 14000.00, 16000.00, '2024-03-01 14:00:00');

-- ============================================================
-- 验证数据
-- ============================================================
SELECT '=== 数据已就绪 ===' AS msg;
SELECT (SELECT COUNT(*) FROM dept) AS 部门数,
       (SELECT COUNT(*) FROM emp)  AS 员工数,
       (SELECT COUNT(*) FROM salary_log) AS 调薪记录;

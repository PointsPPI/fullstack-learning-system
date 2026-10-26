-- ============================================================
-- SQL 练习 02 —— 从基础到窗口函数，共 20 题
-- 每题都有：题目 / 参考答案 / 预期结果说明
--
-- 用法：
--   mysql -ubh -pbh_pwd_2026 -h127.0.0.1 -P3307 --default-character-set=utf8mb4 sql_lab < labs/sql/02-exercises.sql
-- 或者逐条复制到客户端执行。
--
-- 建议做法：先自己想，写完再看参考答案。
-- ============================================================

USE sql_lab;

-- ════════════════════════════════════════════════════════════
-- 第一组：基础查询（1-4）
-- ════════════════════════════════════════════════════════════

-- 【1】查出所有员工的姓名和薪资，按薪资从高到低排序。
-- 预期：10 行，张伟 25000 在最前，吴桐 9000 在最后。
SELECT name, salary
FROM emp
ORDER BY salary DESC;

-- 【2】查出薪资在 12000 到 18000 之间（含）的员工。
-- 预期：李娜(18000)、王强(15000)、陈静(14000)、杨帆(12000)、孙磊(13000)、周涛(16000) —— 6 行
SELECT name, salary
FROM emp
WHERE salary BETWEEN 12000 AND 18000
ORDER BY salary DESC;
-- 注意：BETWEEN 含两端，等价于 salary >= 12000 AND salary <= 18000

-- 【3】查出名字里含"伟"或"涛"的员工。
-- 预期：张伟、周涛 —— 2 行
SELECT name
FROM emp
WHERE name LIKE '%伟%' OR name LIKE '%涛%';
-- 注意：前导 % 会让索引失效（小表无所谓，大表要注意）

-- 【4】查出 2022 年之后入职（含 2022）的员工，显示姓名和入职年份。
-- 预期：陈静(2022)、赵敏(2022)、周涛(2023)、吴桐(2023) —— 4 行
SELECT name, YEAR(hire_date) AS hire_year
FROM emp
WHERE hire_date >= '2022-01-01'
ORDER BY hire_date;
-- 注意：不要写 WHERE YEAR(hire_date) >= 2022，函数包裹列会导致索引失效
--       正确写法是 WHERE hire_date >= '2022-01-01'（范围查询，可用索引）

-- ════════════════════════════════════════════════════════════
-- 第二组：JOIN（5-9）
-- ════════════════════════════════════════════════════════════

-- 【5】查出每个员工的姓名和所在部门名（包括没有部门的员工）。
-- 预期：10 行，吴桐的部门名为 NULL
SELECT e.name, d.name AS dept_name
FROM emp e
LEFT JOIN dept d ON e.dept_id = d.id
ORDER BY e.id;
-- 关键：用 LEFT JOIN 而不是 INNER JOIN，否则吴桐会被丢掉

-- 【6】查出每个部门及其员工数（包括没有员工的部门）。
-- 预期：研发部 4、产品部 2、销售部 3、行政部 0
SELECT d.name AS dept_name, COUNT(e.id) AS emp_count
FROM dept d
LEFT JOIN emp e ON e.dept_id = d.id
GROUP BY d.id, d.name
ORDER BY d.id;
-- 关键：COUNT(e.id) 而不是 COUNT(*)。
--   COUNT(*) 会把"行政部那一行（e 全 NULL）"也算 1，结果错成 1。
--   COUNT(e.id) 不统计 NULL，才是真正的员工数 0。

-- 【7】查出没有员工的部门。
-- 预期：行政部 —— 1 行
SELECT d.name
FROM dept d
LEFT JOIN emp e ON e.dept_id = d.id
WHERE e.id IS NULL;
-- 这是"反连接"（anti-join）的标准写法

-- 【8】查出每个员工和他的上级姓名（总监的上级为 NULL）。
SELECT e.name AS 员工, m.name AS 上级
FROM emp e
LEFT JOIN emp m ON e.manager_id = m.id
ORDER BY e.id;
-- 自连接：同一张表起两个别名

-- 【9】查出薪资高于本部门平均薪资的员工。
-- 预期：张伟(25000>19750)、刘洋(20000>17000)、杨帆(12000>12000?否)、孙磊(13000>12000)
--       实际：张伟、刘洋、孙磊 —— 3 行
--       注意：杨帆 12000 = 销售部均值 12000，不满足"高于"，被排除
SELECT e.name, e.salary, d.name AS dept, ROUND(avg_s.avg_sal, 2) AS dept_avg
FROM emp e
JOIN dept d ON e.dept_id = d.id
JOIN (
    SELECT dept_id, AVG(salary) AS avg_sal
    FROM emp
    WHERE dept_id IS NOT NULL
    GROUP BY dept_id
) avg_s ON avg_s.dept_id = e.dept_id
WHERE e.salary > avg_s.avg_sal
ORDER BY e.salary DESC;
-- 这是"派生表 + JOIN"的经典组合；也可以用窗口函数（见第 17 题）

-- ════════════════════════════════════════════════════════════
-- 第三组：聚合与分组（10-13）
-- ════════════════════════════════════════════════════════════

-- 【10】统计公司总人数、总薪资、平均薪资、最高薪资、最低薪资。
-- 预期：10 人 / 163000.00 / 16300.00 / 25000.00 / 9000.00
SELECT COUNT(*) AS 人数,
       SUM(salary) AS 总薪资,
       ROUND(AVG(salary), 2) AS 平均薪资,
       MAX(salary) AS 最高,
       MIN(salary) AS 最低
FROM emp;

-- 【11】按部门统计人数和平均薪资，只显示人数 >= 2 的部门，按平均薪资降序。
-- 预期：研发部(4人,19750.00)、销售部(3人,12000.00)、产品部(2人,17000.00)
--       按均值降序：研发部 19750 > 产品部 17000 > 销售部 12000
SELECT d.name AS 部门, COUNT(*) AS 人数, ROUND(AVG(e.salary), 2) AS 平均薪资
FROM emp e
JOIN dept d ON e.dept_id = d.id
GROUP BY d.id, d.name
HAVING COUNT(*) >= 2
ORDER BY 平均薪资 DESC;
-- 关键：WHERE 过滤行（分组前），HAVING 过滤组（分组后）
--       若把 COUNT(*) >= 2 写进 WHERE → 报错（聚合函数不能出现在 WHERE）

-- 【12】查出每个部门的薪资总和，并显示占总薪资的百分比。
-- 预期：研发部 74000 (45.40%)、产品部 34000 (20.86%)、销售部 36000 (22.09%)、无部门 9000
SELECT COALESCE(d.name, '(无部门)') AS 部门,
       SUM(e.salary) AS 薪资总额,
       ROUND(SUM(e.salary) * 100.0 / (SELECT SUM(salary) FROM emp), 2) AS 占比
FROM emp e
LEFT JOIN dept d ON e.dept_id = d.id
GROUP BY d.id, d.name
ORDER BY 薪资总额 DESC;
-- COALESCE 处理 NULL 分组，比 IFNULL 更标准（两者都只接受 2 个以上参数）

-- 【13】查出各部门中薪资最高的员工姓名与薪资。
-- 预期：研发部-张伟(25000)、产品部-刘洋(20000)、销售部-孙磊(13000)
SELECT d.name AS 部门, e.name AS 最高薪资员工, e.salary
FROM emp e
JOIN dept d ON e.dept_id = d.id
WHERE e.salary = (
    SELECT MAX(e2.salary)
    FROM emp e2
    WHERE e2.dept_id = e.dept_id
)
ORDER BY e.salary DESC;
-- 关联子查询：外层每行都执行一次内层查询
-- ⚠️ 若同部门有两人并列最高，会返回两行 —— 这通常是期望行为

-- ════════════════════════════════════════════════════════════
-- 第四组：子查询与 CTE（14-16）
-- ════════════════════════════════════════════════════════════

-- 【14】查出薪资高于全公司平均薪资的员工。
-- 预期：全公司均值 16300 → 张伟(25000)、李娜(18000)、刘洋(20000)、周涛(16000) —— 4 行
SELECT name, salary
FROM emp
WHERE salary > (SELECT AVG(salary) FROM emp)
ORDER BY salary DESC;

-- 【15】查出没有任何调薪记录的员工。
-- 预期：张伟、刘洋、陈静、杨帆、吴桐 —— 5 行
SELECT e.name
FROM emp e
WHERE NOT EXISTS (
    SELECT 1 FROM salary_log s WHERE s.emp_id = e.id
)
ORDER BY e.id;
-- ⚠️ 不要用 NOT IN：
--    SELECT ... WHERE id NOT IN (SELECT emp_id FROM salary_log)
--    如果子查询结果里有 NULL，整条查询返回空结果（经典陷阱）
--    这里 emp_id 是 NOT NULL 所以不会踩，但换成可空列就危险

-- 【16】用 CTE 查出各部门的平均薪资，再筛出高于公司平均值的部门。
-- 预期：公司均值 16300 → 研发部 19750、产品部 17000 —— 2 个部门
WITH dept_avg AS (
    SELECT d.id, d.name, AVG(e.salary) AS avg_sal, COUNT(*) AS cnt
    FROM emp e
    JOIN dept d ON e.dept_id = d.id
    GROUP BY d.id, d.name
)
SELECT name AS 部门, ROUND(avg_sal, 2) AS 平均薪资, cnt AS 人数
FROM dept_avg
WHERE avg_sal > (SELECT AVG(salary) FROM emp)
ORDER BY avg_sal DESC;
-- CTE 的好处：可读性（从上往下读）、可复用（同一 CTE 可被引用多次）

-- ════════════════════════════════════════════════════════════
-- 第五组：窗口函数（17-20）
-- ════════════════════════════════════════════════════════════

-- 【17】查出每个员工的薪资，以及他在本部门的排名（用 RANK）。
-- 预期：研发部 张伟 1、李娜 2、周涛 3、王强 4
--       产品部 刘洋 1、陈静 2
--       销售部 孙磊 1、杨帆 2、赵敏 3
SELECT e.name, d.name AS 部门, e.salary,
       RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS 部门排名
FROM emp e
JOIN dept d ON e.dept_id = d.id
ORDER BY e.dept_id, 部门排名;
-- PARTITION BY = 按部门分组，但保留每一行（不像 GROUP BY 会压缩）

-- 【18】查出每个部门薪资前三名的员工（含并列）。
-- 预期：研发部 3 人 / 产品部 2 人（不足3个，全出）/ 销售部 3 人
SELECT * FROM (
    SELECT e.name, d.name AS 部门, e.salary,
           DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rk
    FROM emp e
    JOIN dept d ON e.dept_id = d.id
) t
WHERE rk <= 3
ORDER BY 部门, rk;
-- ⚠️ 窗口函数不能直接写在 WHERE 里（它在 SELECT 阶段才计算）
--    必须包一层子查询，或在 CTE 里算好再过滤
-- DENSE_RANK vs RANK vs ROW_NUMBER：
--   10,10,8 → DENSE_RANK: 1,1,2  RANK: 1,1,3  ROW_NUMBER: 1,2,3

-- 【19】查出每个员工的薪资、全公司累计薪资（按薪资降序累加），以及占总额百分比。
SELECT name, salary,
       SUM(salary) OVER (ORDER BY salary DESC) AS 累计薪资,
       ROUND(salary * 100.0 / SUM(salary) OVER (), 2) AS 占比
FROM emp
ORDER BY salary DESC;
-- 注意两个不同的 OVER 用法：
--   OVER (ORDER BY salary DESC) → 累计窗口（从第一行到当前行）
--   OVER ()                     → 整个结果集（不分区不排序）

-- 【20】查出每次调薪的幅度，以及该员工上一次调薪的幅度（用于对比）。
-- 预期：
--   李娜 +3000（无上一次）
--   王强 +3000（无上一次）
--   赵敏 +2000（无上一次）
--   孙磊 +2000（无上一次）
--   周涛 +2000（无上一次）
-- 因为每个员工只有一条调薪记录，LAG 全是 NULL。
-- 若给李娜再插一条记录，就能看到前后对比。
SELECT s.emp_id, e.name, s.old_salary, s.new_salary,
       s.new_salary - s.old_salary AS 涨幅,
       LAG(s.new_salary - s.old_salary) OVER (
           PARTITION BY s.emp_id ORDER BY s.changed_at
       ) AS 上次涨幅
FROM salary_log s
JOIN emp e ON e.id = s.emp_id
ORDER BY s.emp_id, s.changed_at;
-- LAG / LEAD：取窗口内前/后一行的值，做前后对比的利器

-- ════════════════════════════════════════════════════════════
-- 附加：EXPLAIN 与索引练习（建议单独执行观察）
-- ════════════════════════════════════════════════════════════

-- 【21】对比这些查询的执行计划，找出哪些走了索引、哪些全表扫：
--   EXPLAIN SELECT * FROM emp WHERE id = 1;                      -- const（主键）
--   EXPLAIN SELECT * FROM emp WHERE salary > 15000;              -- range（idx_emp_salary）
--   EXPLAIN SELECT * FROM emp WHERE dept_id = 1;                 -- ref（idx_emp_dept）
--   EXPLAIN SELECT * FROM emp WHERE YEAR(hire_date) = 2022;      -- ALL（函数包裹，索引失效）
--   EXPLAIN SELECT * FROM emp WHERE name LIKE '%伟%';            -- ALL（前导 %，索引失效）
--   EXPLAIN SELECT * FROM emp WHERE name LIKE '张%';             -- ALL（name 没索引，仍需全扫）
--   EXPLAIN SELECT * FROM emp ORDER BY salary DESC;              -- index（索引顺序扫描）

-- 【22】加一个索引，让 ORDER BY salary + WHERE dept_id 走索引：
--   ALTER TABLE emp ADD KEY idx_dept_salary (dept_id, salary);
--   EXPLAIN SELECT * FROM emp WHERE dept_id = 1 ORDER BY salary DESC;
--   观察 Extra 是否还有 Using filesort

-- ════════════════════════════════════════════════════════════
-- 附加：事务与并发（需要两个会话）
-- ════════════════════════════════════════════════════════════

-- 【23】不可重复读演示
-- 会话 A：
--   SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
--   BEGIN;
--   SELECT salary FROM emp WHERE id = 2;      -- 读到 18000
-- 会话 B：
--   UPDATE emp SET salary = 20000 WHERE id = 2;
--   COMMIT;
-- 会话 A：
--   SELECT salary FROM emp WHERE id = 2;      -- READ COMMITTED 下读到 20000（不可重复读）
--   -- 若隔离级别是 REPEATABLE READ，仍读到 18000（MVCC 快照）
--   COMMIT;

-- 【24】幻读演示
-- 会话 A：
--   SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
--   BEGIN;
--   SELECT COUNT(*) FROM emp WHERE dept_id = 3;   -- 3 行
-- 会话 B：
--   INSERT INTO emp (name, dept_id, salary, hire_date) VALUES ('新员工', 3, 10000, '2026-01-01');
--   COMMIT;
-- 会话 A：
--   SELECT COUNT(*) FROM emp WHERE dept_id = 3;   -- MVCC 快照读：仍 3 行
--   SELECT COUNT(*) FROM emp WHERE dept_id = 3 FOR UPDATE;  -- 当前读：4 行！
--   COMMIT;
-- 这就是"快照读"和"当前读"的区别 —— 面试高频

-- ════════════════════════════════════════════════════════════
-- 附加：SQL 注入对照（在应用层做，这里只演示原理）
-- ════════════════════════════════════════════════════════════

-- 【25】注入原理
-- 假设代码这样拼 SQL：
--   "SELECT * FROM emp WHERE name = '" + input + "'"
-- 输入：x' OR '1'='1
-- 实际执行：
--   SELECT * FROM emp WHERE name = 'x' OR '1'='1'   → 返回全部 10 行
--
-- 输入：x'; DROP TABLE emp; --
-- 实际执行：
--   SELECT * FROM emp WHERE name = 'x'; DROP TABLE emp; --'  → 删表
--
-- 防护：应用层用 PreparedStatement（#{}），SQL 结构在参数到来前已固定
--       数据库账号只给必要权限（不给 DROP）

SELECT '=== 练习脚本执行完毕，共 25 题（含附加说明） ===' AS msg;

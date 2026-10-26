# MySQL 与 SQL

::: key 一句话抓住本质
SQL 只有四类语句：**建（DDL）、改（DML）、查（DQL）、控（TCL）**。
而所有"慢查询"的根源只有两条：**没走索引** 或 **扫描行数太多**。
:::

## 学习点

| # | 知识点 | 优先级 |
|---|---|---|
| 1 | 建表、数据类型与约束 | ★★★★★ |
| 2 | 增删改查基础 | ★★★★★ |
| 3 | JOIN 五种连接 | ★★★★★ |
| 4 | 子查询与派生表 | ★★★★ |
| 5 | 聚合、GROUP BY、HAVING | ★★★★★ |
| 6 | 事务 ACID 与隔离级别 | ★★★★★ |
| 7 | 索引原理与最左前缀 | ★★★★★ |
| 8 | EXPLAIN 与慢查询优化 | ★★★★★ |
| 9 | 范式与表设计 | ★★★ |
| 10 | 窗口函数 | ★★★★ |
| 11 | SQL 注入与防护 | ★★★★★ |

---

## 一、建表、数据类型与约束

### 完整建表示例

```sql
CREATE TABLE book (
    id          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    title       VARCHAR(200)  NOT NULL                COMMENT '书名',
    author      VARCHAR(100)  NOT NULL                COMMENT '作者',
    isbn        VARCHAR(20)   DEFAULT NULL            COMMENT 'ISBN',
    category_id BIGINT        NOT NULL                COMMENT '分类id',
    price       DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '定价',
    stock       INT           NOT NULL DEFAULT 0      COMMENT '可借库存',
    status      TINYINT       NOT NULL DEFAULT 1      COMMENT '1上架 0下架',
    remark      VARCHAR(500)  DEFAULT NULL            COMMENT '简介',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_book_isbn (isbn),
    KEY idx_book_category (category_id),
    KEY idx_book_status_stock (status, stock)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '图书';
```

### 数据类型选择

::: key 类型选择的三个原则
1. **够用就好**：能存 100 人就不要用 BIGINT
2. **定长用 CHAR，变长用 VARCHAR**：性别用 `CHAR(1)`，书名用 `VARCHAR(200)`
3. **金额绝不用 FLOAT/DOUBLE**：用 `DECIMAL(10,2)`
:::

| 类型 | 范围/说明 | 场景 |
|---|---|---|
| `TINYINT` | -128~127（无符号 0~255） | 状态、标志位 |
| `SMALLINT` | ±3.2万 | 小范围计数 |
| `INT` | ±21亿 | 常规 id |
| `BIGINT` | ±9.2e18 | 大数据量 id、时间戳 |
| `DECIMAL(M,D)` | 精确小数 | **金额（唯一正确选择）** |
| `FLOAT` / `DOUBLE` | 近似值，有精度误差 | 科学计算（**不要用于金额**） |
| `CHAR(n)` | 定长，不足补空格 | 固定长度（性别、编码） |
| `VARCHAR(n)` | 变长 | 大多数文本 |
| `TEXT` | 最长 64KB | 长文本（不要用于频繁查询的字段） |
| `DATETIME` | 8 字节，范围 1000-9999 | 业务时间 |
| `TIMESTAMP` | 4 字节，范围 1970-2038，带时区 | 创建/更新时间 |
| `JSON` | 原生 JSON | 半结构化数据 |

::: danger DECIMAL 与 FLOAT 的真实事故
```sql
-- ✗ FLOAT 存金额
CREATE TABLE orders (amount FLOAT);
INSERT INTO orders VALUES (0.1), (0.2);
SELECT SUM(amount) FROM orders;   -- 0.30000001192092896
-- 对账时差 0.00000001 元，累积起来就是财务事故
```

```sql
-- ✓ DECIMAL
CREATE TABLE orders (amount DECIMAL(10,2));   -- 最多 10 位，2 位小数
SELECT SUM(amount) FROM orders;   -- 0.30
```

**Java 侧必须用 `BigDecimal` 对应，不能用 double。**
:::

::: warn VARCHAR(200) 里的 200 是什么
**字符数，不是字节数**（MySQL 5.0+）。
- `utf8mb4` 下 1 个中文字符 = 4 字节
- `VARCHAR(200)` 最多 800 字节

索引长度限制：InnoDB 单列索引最大 **3072 字节**（`utf8mb4` 下约 768 字符）。
所以 `VARCHAR(1000)` 整列建索引会失败，需要用前缀索引 `KEY (col(191))`。
:::

### 约束

```sql
-- 主键
PRIMARY KEY (id)

-- 唯一
UNIQUE KEY uk_card_no (card_no)

-- 非空
NOT NULL

-- 默认值
DEFAULT 0 / DEFAULT CURRENT_TIMESTAMP

-- 自增
AUTO_INCREMENT

-- 外键（生产环境慎用，见下）
CONSTRAINT fk_book_category FOREIGN KEY (category_id) REFERENCES category(id)
    ON DELETE RESTRICT ON UPDATE CASCADE

-- 检查约束（MySQL 8.0.16+ 真正生效）
CONSTRAINT chk_price CHECK (price >= 0)
```

::: danger 为什么很多团队禁用物理外键
```sql
-- 有外键的后果
DELETE FROM category WHERE id = 1;
-- ERROR 1451: Cannot delete or update a parent row: a foreign key constraint fails
```

**问题：**
1. **性能**：每次写入都要检查、加锁，高并发下容易死锁
2. **运维困难**：分库分表后外键无法跨库；数据迁移/批量导入要按依赖顺序
3. **删除困难**：想删一条数据要级联处理一堆关系
4. **测试数据难造**：必须先造出一整套关联数据

**替代方案：逻辑外键**
- 数据库不建外键约束
- 由**应用层**保证一致性（Service 里校验）
- 定期跑"孤儿数据检查"脚本

本工坊的 `book.category_id` 就是逻辑外键，理由如上。
:::

### 修改表结构

```sql
-- 加列
ALTER TABLE book ADD COLUMN publisher VARCHAR(100) DEFAULT NULL COMMENT '出版社';

-- 改列
ALTER TABLE book MODIFY COLUMN remark VARCHAR(1000) DEFAULT NULL COMMENT '简介';

-- 改列名
ALTER TABLE book CHANGE COLUMN remark intro VARCHAR(500) COMMENT '简介';

-- 删列
ALTER TABLE book DROP COLUMN publisher;

-- 加索引
ALTER TABLE book ADD KEY idx_book_author (author);

-- 删索引
ALTER TABLE book DROP KEY idx_book_author;

-- 加唯一约束
ALTER TABLE book ADD UNIQUE KEY uk_isbn (isbn);
```

::: danger 大表 ALTER 会锁表
MySQL 5.6+ 支持 `ALGORITHM=INPLACE`（在线 DDL），但**不是所有操作都支持**。
- 加/删索引：INPLACE（不锁写）
- 加列（末尾）：INPLACE
- 改列类型、删列、改列名：**需要 COPY 表**（锁写，大表可能要几十分钟）

**大表上线前用 `pt-online-schema-change` 或 `gh-ost` 工具。**
:::

---

## 二、增删改查基础

### INSERT

```sql
-- 单条
INSERT INTO book (title, author, category_id, price, total)
VALUES ('深入理解计算机系统', 'Randal', 1, 139.00, 5);

-- 批量（推荐，一条 SQL 插入多行，性能好得多）
INSERT INTO book (title, author, category_id, price, total) VALUES
('Java 核心技术', 'Horstmann', 1, 149.00, 3),
('活着', '余华', 2, 45.00, 8),
('人类简史', '赫拉利', 3, 68.00, 5);

-- 冲突时更新（UPSERT）
INSERT INTO book (isbn, title, total) VALUES ('9787111544937', 'CSAPP', 10)
ON DUPLICATE KEY UPDATE total = total + 10;

-- 冲突时忽略
INSERT IGNORE INTO book (...) VALUES (...);
```

::: key 批量插入 vs 循环单条插入
```java
// ✗ 1000 次网络往返 + 1000 次事务
for (Book b : books) mapper.insert(b);

// ✓ 一次往返
mapper.insertBatch(books);
```

```sql
INSERT INTO book (...) VALUES (...), (...), (...);  -- 1 条 SQL
```
性能差距是**几十倍**。但注意：单条 SQL 太长会受 `max_allowed_packet` 限制（默认 64MB）。
:::

### UPDATE

```sql
UPDATE book SET stock = stock - 1 WHERE id = 1;

-- 多字段
UPDATE book SET title = '新书名', price = 99.00 WHERE id = 1;

-- ⚠️ 没有 WHERE 会更新全表！
UPDATE book SET status = 0;   -- 全表下架

-- 安全模式（MySQL 客户端）：没有 WHERE 的 UPDATE/DELETE 直接拒绝执行
SET sql_safe_updates = 1;
```

::: danger 忘记 WHERE 是最经典的删库方式
```sql
DELETE FROM book;             -- 全删（不是删表结构）
UPDATE book SET price = 0;    -- 全改
```

**三层防护：**
1. 生产环境开 `sql_safe_updates`
2. 执行前先 `SELECT` 验证条件命中行数
3. 重要操作先备份 + 用事务包起来
:::

### SELECT 基础

```sql
SELECT id, title, price FROM book;                    -- 指定列（生产环境永远不要 SELECT *）
SELECT * FROM book;                                   -- 全列（性能差、易受表结构变化影响）
SELECT DISTINCT category_id FROM book;                -- 去重
SELECT title AS 书名, price * 0.8 AS 折后价 FROM book; -- 别名
SELECT id, title FROM book LIMIT 10 OFFSET 20;        -- 分页（跳过 20 取 10）
SELECT id, title FROM book LIMIT 20, 10;              -- 同上（简写）
```

::: key 为什么不要 SELECT *
1. **传输浪费**：`remark` 500 字 × 1000 行 = 500KB 无用流量
2. **索引失效**：`SELECT *` 无法用"覆盖索引"（索引里就有全部需要的列，不用回表）
3. **表结构变化风险**：加了一列大字段，所有 `SELECT *` 的接口都变慢
:::

### WHERE 条件

```sql
WHERE price > 50
WHERE price BETWEEN 50 AND 100
WHERE category_id IN (1, 2, 3)
WHERE title LIKE 'Java%'          -- 前缀匹配（能用索引）
WHERE title LIKE '%Java%'         -- 包含（索引失效）
WHERE remark IS NULL
WHERE remark IS NOT NULL
WHERE status = 1 AND stock > 0
WHERE status = 1 OR stock > 0     -- OR 可能导致索引失效
WHERE NOT status = 1
```

::: warn 索引失效的常见写法
```sql
-- ✗ 函数包裹列 → 索引失效
WHERE DATE(created_at) = '2026-10-25'
-- ✓ 改成范围
WHERE created_at >= '2026-10-25' AND created_at < '2026-10-26'

-- ✗ 隐式类型转换 → 索引失效
WHERE card_no = 123456          -- card_no 是 VARCHAR，传了数字
-- ✓
WHERE card_no = '123456'

-- ✗ 前导模糊 → 索引失效
WHERE title LIKE '%Java%'
-- ✓ 前缀匹配
WHERE title LIKE 'Java%'

-- ✗ 对列做运算
WHERE price * 2 > 100
-- ✓
WHERE price > 50
```
:::

### ORDER BY 与 LIMIT

```sql
ORDER BY price DESC, id ASC         -- 多字段排序
ORDER BY price DESC LIMIT 10        -- Top 10
```

::: danger 深分页性能问题
```sql
-- ✗ 第 10000 页：要扫描 100000 行，丢弃前 99990 行
SELECT * FROM book ORDER BY id LIMIT 99990, 10;
```

```sql
-- ✓ 游标分页（keyset）：任何深度都很快
SELECT * FROM book WHERE id > 99990 ORDER BY id LIMIT 10;
```

判断依据：**能跳页 → offset；只能"下一页" → cursor**。
管理后台表格用 offset（有跳页需求），信息流用 cursor。
:::

---

## 三、JOIN 五种连接

### 数据准备

```sql
-- category: 1计算机 2文学 3历史 4科学
-- book: 12 本，其中"上帝掷骰子吗"的 category_id = 4
```

### ① INNER JOIN（内连接）：只保留两边都匹配的

```sql
SELECT b.id, b.title, c.name AS category
FROM book b
INNER JOIN category c ON b.category_id = c.id;
-- 返回：12 行（每本书都有分类，全部匹配）
```

### ② LEFT JOIN（左连接）：保留左表全部，右表没有则为 NULL

```sql
SELECT c.id, c.name, COUNT(b.id) AS bookCount
FROM category c
LEFT JOIN book b ON b.category_id = c.id
GROUP BY c.id, c.name;
```

```
+----+--------+-----------+
| id | name   | bookCount |
+----+--------+-----------+
| 1  | 计算机 | 5         |
| 2  | 文学   | 3         |
| 3  | 历史   | 2         |
| 4  | 科学   | 2         |
+----+--------+-----------+
-- 即使某个分类没有书，也会出现在结果里（bookCount = 0）
```

### ③ RIGHT JOIN（右连接）：保留右表全部

```sql
-- 等价于把 LEFT JOIN 的两张表调换位置（可读性更好）
SELECT ... FROM book b RIGHT JOIN category c ON ...
```

::: tip 实际项目中几乎只用 LEFT JOIN
因为 `A RIGHT JOIN B` 永远可以改写成 `B LEFT JOIN A`，而且从左往右读更符合思维习惯。
:::

### ④ FULL OUTER JOIN（全外连接）

::: warn MySQL 不支持 FULL OUTER JOIN
需要用 `LEFT JOIN UNION RIGHT JOIN` 模拟：
```sql
SELECT b.id, b.title, c.name
FROM book b LEFT JOIN category c ON b.category_id = c.id
UNION
SELECT b.id, b.title, c.name
FROM book b RIGHT JOIN category c ON b.category_id = c.id;
```
PostgreSQL、Oracle、SQL Server 支持 `FULL OUTER JOIN`。
:::

### ⑤ CROSS JOIN（笛卡尔积）

```sql
SELECT * FROM book CROSS JOIN category;   -- 12 × 4 = 48 行
```

::: danger 忘记写 ON 条件 = 笛卡尔积 = 灾难
```sql
-- ✗ 想查书和分类，忘了 ON
SELECT * FROM book, category;    -- 12 × 4 = 48 行（小表还好）

-- 如果是 10 万行 × 10 万行 = 100 亿行 → 数据库直接卡死
```
多表查询一定要写连接条件。
:::

### 自连接（同一张表连接自己）

```sql
-- 场景：查"和《活着》同一分类的书"
SELECT b2.title
FROM book b1
JOIN book b2 ON b1.category_id = b2.category_id AND b2.id != b1.id
WHERE b1.title = '活着';
```

```sql
-- 场景：员工表查"每个员工和他的上级"
SELECT e.name AS 员工, m.name AS 上级
FROM employee e
LEFT JOIN employee m ON e.manager_id = m.id;
```

### JOIN 的执行顺序与优化

::: key 优化器的思考
```sql
SELECT * FROM book b JOIN category c ON b.category_id = c.id WHERE c.code = 'IT';
```

优化器可能：
1. 先过滤 category（`code='IT'` → 1 行），再用它的 id 去 book 表找（**驱动表 = category**）
2. 或者先扫 book 全表，再逐行找 category

**原则：小表驱动大表。** 让结果集小的表作为驱动表，减少外层循环次数。
`EXPLAIN` 的 `rows` 列最小的那个就是驱动表。
:::

::: tip JOIN 的 ON 和 WHERE 别搞混
```sql
-- LEFT JOIN 时，条件写在 ON vs WHERE 结果完全不同
SELECT * FROM category c LEFT JOIN book b ON b.category_id = c.id AND b.price > 100;
-- → 所有分类都出现；贵的书才匹配，不匹配的书的字段为 NULL

SELECT * FROM category c LEFT JOIN book b ON b.category_id = c.id WHERE b.price > 100;
-- → 只有"有贵书"的分类出现（WHERE 过滤掉了 NULL 行 → 变成 INNER JOIN 效果）

-- INNER JOIN 时两者等价（优化器会做同样的事）
```
**规则：LEFT JOIN 的右表过滤条件写在 ON 里，不要写在 WHERE 里。**
:::

---

## 四、子查询与派生表

### 标量子查询（返回单个值）

```sql
-- 查价格高于平均价的书
SELECT title, price FROM book
WHERE price > (SELECT AVG(price) FROM book);
```

### 列子查询（返回一列）

```sql
-- 查"有未还借阅记录"的书
SELECT title FROM book
WHERE id IN (SELECT book_id FROM borrow WHERE return_date IS NULL);

-- EXISTS（通常比 IN 快，尤其子查询结果大时）
SELECT b.title FROM book b
WHERE EXISTS (SELECT 1 FROM borrow br WHERE br.book_id = b.id AND br.return_date IS NULL);
```

::: compare IN vs EXISTS
| | IN | EXISTS |
|---|---|---|
| 语义 | 值在集合里 | 是否存在满足条件的行 |
| 子查询大 | 慢（要构建完整集合） | 快（找到一条就返回） |
| NULL 陷阱 | `IN (含 NULL)` 可能返回意外结果 | 无此问题 |
| 适用 | 子查询结果集小 | 子查询结果集大 / 关联子查询 |
:::

::: danger NOT IN + NULL = 空结果（经典陷阱）
```sql
SELECT * FROM book WHERE id NOT IN (SELECT book_id FROM borrow);
-- 如果 borrow.book_id 里有任何 NULL → 结果为空！

-- 原因：NOT IN (1, 2, NULL) 等价于 id != 1 AND id != 2 AND id != NULL
--      而 id != NULL 结果是 NULL（不是 true），所以整行被过滤

-- ✓ 解法 1：排除 NULL
WHERE id NOT IN (SELECT book_id FROM borrow WHERE book_id IS NOT NULL)

-- ✓ 解法 2：用 NOT EXISTS
WHERE NOT EXISTS (SELECT 1 FROM borrow br WHERE br.book_id = book.id)
```
:::

### 派生表（FROM 里的子查询）

```sql
-- 每个分类的平均价格，再筛出高于 100 的
SELECT * FROM (
    SELECT category_id, AVG(price) AS avg_price
    FROM book
    GROUP BY category_id
) t
WHERE t.avg_price > 100;
```

::: warn 派生表必须有别名
```sql
SELECT * FROM (SELECT ...) ;      -- ✗ ERROR 1248: Every derived table must have its own alias
SELECT * FROM (SELECT ...) t;     -- ✓
```
:::

### CTE（公用表表达式，MySQL 8.0+）

```sql
WITH cat_stat AS (
    SELECT category_id, COUNT(*) AS cnt, AVG(price) AS avg_price
    FROM book GROUP BY category_id
)
SELECT c.name, s.cnt, s.avg_price
FROM cat_stat s
JOIN category c ON s.category_id = c.id
WHERE s.cnt > 2;

-- 递归 CTE（查树形结构，如分类的层级）
WITH RECURSIVE tree AS (
    SELECT id, name, parent_id, 1 AS lvl FROM category WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.name, c.parent_id, t.lvl + 1
    FROM category c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree ORDER BY lvl;
```

::: tip CTE vs 派生表
CTE 的优势：可读性（从上往下读）、可复用（同一个 CTE 引用多次）、支持递归。
性能上 MySQL 8 直接内联（和派生表一样），不会物化。
:::

---

## 五、聚合、GROUP BY、HAVING

### 五个聚合函数

```sql
SELECT
    COUNT(*)          AS 总行数,
    COUNT(remark)     AS 有简介的书数,      -- COUNT(列) 不统计 NULL
    SUM(total)        AS 总藏书量,
    AVG(price)        AS 均价,
    MAX(price)        AS 最高价,
    MIN(price)        AS 最低价
FROM book;
```

::: danger COUNT(*) vs COUNT(列) vs COUNT(1)
```sql
COUNT(*)      -- 统计所有行（包括全 NULL 的行）
COUNT(1)      -- 同 COUNT(*)，优化器处理一样
COUNT(remark) -- 只统计 remark 非 NULL 的行
```
`COUNT(*)` 和 `COUNT(1)` 性能相同（InnoDB 会选最小的索引扫描）。
**需要"行数"用 `COUNT(*)`，需要"某列非空的数量"用 `COUNT(列)`。**
:::

### GROUP BY

```sql
-- 每个分类的书籍统计
SELECT
    category_id,
    COUNT(*)   AS cnt,
    AVG(price) AS avg_price
FROM book
GROUP BY category_id;
```

::: danger ONLY_FULL_GROUP_BY：MySQL 5.7+ 默认开启
```sql
-- ✗ 报错：title 不在 GROUP BY 里，也没被聚合
SELECT category_id, title, COUNT(*) FROM book GROUP BY category_id;
-- ERROR 1055: Expression #2 of SELECT list is not in GROUP BY clause
```

**为什么不允许？** 因为一个分类有多本书，`title` 该显示哪本？语义不明确。

**三种解法：**
```sql
-- ① 用聚合函数包起来
SELECT category_id, MAX(title) AS sample_title, COUNT(*) FROM book GROUP BY category_id;

-- ② 把 title 加进 GROUP BY（改变分组粒度）
SELECT category_id, title, COUNT(*) FROM book GROUP BY category_id, title;

-- ③ 关闭 sql_mode（不推荐，会掩盖设计问题）
SET sql_mode = (SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''));
```
:::

### HAVING vs WHERE

::: key 执行顺序决定了谁能用谁
```
FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

- **WHERE**：在分组**之前**过滤**行**
- **HAVING**：在分组**之后**过滤**组**

```sql
SELECT category_id, COUNT(*) AS cnt, AVG(price) AS avg_price
FROM book
WHERE status = 1                    -- ① 先过滤掉下架的书（行级）
GROUP BY category_id
HAVING cnt > 2 AND avg_price > 50;  -- ② 再过滤掉书少的分类（组级）
```
:::

::: warn HAVING 里不能用 SELECT 的别名？—— MySQL 可以，标准 SQL 不行
```sql
-- MySQL 允许（扩展）
HAVING cnt > 2

-- 标准写法（PostgreSQL 等要求）
HAVING COUNT(*) > 2
```
为了可移植性，写标准形式更安全。
:::

---

## 六、事务 ACID 与隔离级别

### ACID

| 特性 | 含义 | InnoDB 怎么保证 |
|---|---|---|
| **A** 原子性 | 要么全成功，要么全失败 | undo log（回滚日志） |
| **C** 一致性 | 事务前后数据满足约束 | 由 A + I + D 共同保证 |
| **I** 隔离性 | 并发事务互不干扰 | 锁 + MVCC |
| **D** 持久性 | 提交后不丢失 | redo log（重做日志） |

### 四种并发问题

| 问题 | 描述 | 例子 |
|---|---|---|
| **脏读** | 读到其他事务**未提交**的修改 | A 改了余额没提交，B 读到了 |
| **不可重复读** | 同一事务内两次读**同一行**结果不同 | A 第一次读=100，B 改并提交，A 再读=50 |
| **幻读** | 同一事务内两次读**同一个范围**行数不同 | A 第一次查到 5 行，B 插入 3 行，A 再查 8 行 |
| **丢失更新** | 两个事务同时改，后提交的覆盖先提交的 | A 改 stock=1，B 也改 stock=1，实际只减了 1 |

::: key 不可重复读 vs 幻读（最容易混）
- **不可重复读**：同一**行**的**内容**变了（UPDATE）
- **幻读**：同一**范围**的**行数**变了（INSERT / DELETE）

前者你锁住这一行就行；后者你锁住现有行也没用，新行会"凭空出现"。
:::

### 四种隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| `READ UNCOMMITTED`（读未提交） | ✅ 可能 | ✅ 可能 | ✅ 可能 |
| `READ COMMITTED`（读已提交） | ❌ 不会 | ✅ 可能 | ✅ 可能 |
| `REPEATABLE READ`（**InnoDB 默认**） | ❌ | ❌ | ⚠️ 标准说可能，**InnoDB 用间隙锁基本避免** |
| `SERIALIZABLE`（串行化） | ❌ | ❌ | ❌ |

```sql
-- 查看
SELECT @@transaction_isolation;

-- 设置（当前会话 / 全局）
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET GLOBAL TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

::: key InnoDB 的 REPEATABLE READ 为什么能解决幻读
靠 **MVCC（一致性快照读）** + **间隙锁（Next-Key Lock）**：

- **快照读**（普通 `SELECT`）：用 MVCC，读事务开始时的快照 → 天然不会幻读
- **当前读**（`SELECT ... FOR UPDATE`、`UPDATE`、`DELETE`）：用 Next-Key Lock（行锁 + 间隙锁），
  锁住范围 → 别的事务插不进来

这也解释了为什么"同一个事务里先普通 SELECT 再 FOR UPDATE，结果会不一致"。
:::

### MVCC 的两个隐藏列

InnoDB 每行都有两个隐藏列：

```
DB_TRX_ID       6 字节   最后修改该行的事务 ID
DB_ROLL_PTR     7 字节   指向 undo log 的回滚指针
```

::: key MVCC 怎么判断"这行我能不能看到"
```
读操作时，沿 undo log 找到该行的历史版本，按以下规则判断：
① 该版本的 trx_id < 当前事务的 min_trx_id  → 可见（在我之前就提交了）
② 该版本的 trx_id >= 当前事务的 max_trx_id  → 不可见（我之后才开的事务）
③ 该版本的 trx_id 在我活跃事务列表里        → 不可见（还没提交）
④ 其他                                      → 可见
```
这套机制让**读不加锁**，读写不阻塞，是 InnoDB 高并发的核心。
:::

### 事务实战

```sql
BEGIN;                                  -- 或 START TRANSACTION
UPDATE book SET stock = stock - 1 WHERE id = 1 AND stock > 0;
INSERT INTO borrow (book_id, reader_id, borrow_date, due_date) VALUES (1, 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY));
COMMIT;

-- 或回滚
ROLLBACK;
```

::: danger 扣库存必须用"条件更新"而不是"先查后改"
```sql
-- ✗ 并发下超卖
SELECT stock FROM book WHERE id = 1;         -- 读到 1
-- （另一个事务也读到 1）
UPDATE book SET stock = 0 WHERE id = 1;      -- 覆盖

-- ✓ 条件更新（原子操作，靠数据库行锁保证）
UPDATE book SET stock = stock - 1 WHERE id = 1 AND stock > 0;
-- 影响行数 = 0 → 说明库存不足，抛业务异常
```
**判断依据：`affectedRows === 0` 表示库存不足。这一条 SQL 就解决了超卖问题。**
:::

::: warn 事务要短
```java
@Transactional
public void borrow() {
    // ✗ 事务里发 HTTP、发消息、sleep
    httpClient.call();       // 网络抖动 3 秒 → 行锁持有 3 秒
    mq.send();
    Thread.sleep(1000);
}
```
长事务的后果：
1. 行锁长时间不释放 → 其他事务等待超时
2. undo log 无法清理 → 表空间膨胀
3. 主从延迟加剧

**原则：事务只包裹必须原子的数据库操作。**
:::

---

## 七、索引原理与最左前缀

### B+ 树为什么是 MySQL 的选择

::: key 三个关键对比
| 结构 | 范围查询 | 磁盘 IO | 为什么不用 |
|---|---|---|---|
| 哈希 | ❌ 不支持 | 1 次 | 只能等值查，不能排序/范围 |
| 二叉树 | ✅ | 高（树高） | 数据量大时树太深，IO 太多 |
| 红黑树 | ✅ | 高 | 同上 |
| **B 树** | ✅ | 中 | 非叶子节点也存数据 → 单节点存的键少 → 树更高 |
| **B+ 树** | ✅ | **低** | ✅ 采用 |

**B+ 树的两个关键优化：**
1. **非叶子节点只存键**，不存数据 → 一个 16KB 页能存更多键 → 树更矮（3-4 层就能存千万行）
2. **所有数据在叶子节点，且叶子节点用双向链表相连** → 范围查询只需顺着链表扫
:::

```
                     [50 | 100]                   ← 根（只存键）
                    /     |      \
          [20|35]      [60|80]      [120|150]      ← 中间节点
         /  |  \       /  |  \       /   |   \
       叶子→叶子→叶子→叶子→叶子→叶子→叶子→叶子     ← 叶子：键 + 数据 + 双向链表
```

### 聚簇索引 vs 二级索引

::: key 这是理解"回表"的关键
**聚簇索引（主键索引）**：叶子节点存放**整行数据**
```
[id=1] → 整行 (id=1, title='CSAPP', author='Randal', price=139, ...)
```

**二级索引（普通索引）**：叶子节点存放**索引列 + 主键值**
```
[author='余华'] → id=6
[author='霍金'] → id=11
```

**回表**：用二级索引找到 id，再拿 id 去聚簇索引查整行 → **两次 B+ 树查找**
:::

```sql
-- 需要回表（因为要 title，索引 idx_author 里没有）
SELECT title FROM book WHERE author = '余华';
-- ① idx_author 找到 id=6
-- ② 聚簇索引用 id=6 查整行，取 title

-- 不需要回表（覆盖索引）
SELECT id, author FROM book WHERE author = '余华';
-- idx_author 叶子节点就有 id 和 author → 直接返回
```

::: tip 覆盖索引是最高效的优化手段
```sql
-- 加一个联合索引
ALTER TABLE book ADD KEY idx_author_title (author, title);

-- 现在这条查询完全走索引，不回表
SELECT title FROM book WHERE author = '余华';
```
`EXPLAIN` 的 `Extra` 显示 **`Using index`** 就是覆盖索引。
:::

### 最左前缀原则

```sql
ALTER TABLE book ADD KEY idx_abc (a, b, c);
```

| 查询条件 | 能用索引吗 | 用到哪些列 |
|---|---|---|
| `WHERE a=1` | ✅ | a |
| `WHERE a=1 AND b=2` | ✅ | a, b |
| `WHERE a=1 AND b=2 AND c=3` | ✅ | a, b, c |
| `WHERE a=1 AND c=3` | ✅ 部分 | 只用 a（c 用不上，因为跳过了 b） |
| `WHERE b=2` | ❌ | 全表扫（没有 a） |
| `WHERE b=2 AND c=3` | ❌ | 全表扫 |
| `WHERE c=3` | ❌ | 全表扫 |
| `WHERE a=1 AND b>2 AND c=3` | ✅ 部分 | a, b（c 用不上，因为 b 是范围） |
| `WHERE a=1 AND b LIKE 'x%'` | ✅ | a, b |
| `WHERE a=1 AND b LIKE '%x'` | ✅ 部分 | 只用 a |

::: key 两个精确规则
1. **必须从最左列开始，不能跳过中间列**
2. **遇到范围查询（`>`, `<`, `BETWEEN`, `LIKE 'x%'`）后，后续列索引失效**（但排序仍可能用上）

记忆口诀：**"最左优先，遇范围止。"**
:::

::: warn 索引列的顺序应该怎么定
```sql
-- 场景：经常按 (status, stock) 查"可借图书"
WHERE status = 1 AND stock > 0

-- 索引 (status, stock)：status 等值 + stock 范围 → 两列都用上 ✓

-- 如果反过来 (stock, status)：
-- WHERE stock > 0 AND status = 1 → stock 是范围，之后 status 用不上 ✗
```
**原则：等值条件在前，范围条件在后；区分度高的在前。**

区分度 = `COUNT(DISTINCT col) / COUNT(*)`，越接近 1 越好。性别列区分度只有 0.5，不适合单独做索引。
:::

### 索引类型

```sql
-- 主键（聚簇）
PRIMARY KEY (id)

-- 唯一
UNIQUE KEY uk_isbn (isbn)

-- 普通
KEY idx_author (author)

-- 联合
KEY idx_cat_status (category_id, status)

-- 前缀（长文本）
KEY idx_title_prefix (title(20))

-- 全文（中文需要 ngram 分词器）
FULLTEXT KEY ft_remark (remark) WITH PARSER ngram

-- 函数索引（MySQL 8.0.13+）
KEY idx_year ((YEAR(created_at)))
```

### 什么时候不该建索引

::: danger 五种浪费索引的场景
1. **表很小**（几百行）→ 全表扫比走索引快
2. **区分度极低**（性别、状态只有两三个值）→ 索引过滤效果差
3. **频繁大量写入**（日志表）→ 每次写要维护索引，拖慢插入
4. **从不作为查询条件的列** → 纯浪费
5. **已经有联合索引的最左前缀** → `(a,b)` 已能覆盖 `WHERE a=?`，不需要单独的 `(a)`
:::

---

## 八、EXPLAIN 与慢查询优化

### EXPLAIN 关键列

```sql
EXPLAIN SELECT b.title, c.name
FROM book b JOIN category c ON b.category_id = c.id
WHERE b.status = 1 AND b.price > 50
ORDER BY b.id DESC LIMIT 10;
```

| 列 | 含义 | 关键值 |
|---|---|---|
| `id` | 查询序号 | 越大越先执行（子查询） |
| `select_type` | 查询类型 | SIMPLE / PRIMARY / SUBQUERY / DERIVED / UNION |
| `table` | 表名 | |
| `partitions` | 分区 | |
| `type` | **访问类型** | 见下表（最重要） |
| `possible_keys` | 可能用的索引 | |
| `key` | **实际用的索引** | NULL = 没用索引 |
| `key_len` | 索引使用长度 | 判断用了联合索引的几列 |
| `ref` | 索引比较的对象 | const / 列名 |
| `rows` | **预估扫描行数** | 越小越好 |
| `filtered` | 过滤后剩余百分比 | 越小说明过滤效果好 |
| `Extra` | **额外信息** | 见下表 |

### type 的性能排序（从好到坏）

| type | 含义 | 评价 |
|---|---|---|
| `system` | 表只有一行 | 最好 |
| `const` | 主键/唯一索引等值查 | 极好 |
| `eq_ref` | 联表时用主键/唯一索引 | 很好 |
| `ref` | 普通索引等值查 | 好 |
| `range` | 索引范围查 | 可接受 |
| `index` | 全索引扫描 | 较差 |
| `ALL` | **全表扫描** | 最差，必须优化 |

::: key 优化目标：至少到 range，最好到 ref
看到 `type = ALL` 且 `rows` 很大 → 一定有优化空间。
:::

### Extra 关键值

| Extra | 含义 | 评价 |
|---|---|---|
| `Using index` | **覆盖索引**，不回表 | ✅ 极好 |
| `Using where` | 用 WHERE 过滤（可能没走索引） | 一般 |
| `Using index condition` | 索引条件下推（ICP） | ✅ 好 |
| `Using temporary` | 用了临时表（GROUP BY / DISTINCT 没索引） | ⚠️ 差 |
| `Using filesort` | 文件排序（ORDER BY 没走索引） | ⚠️ 差 |
| `Using join buffer` | 联表没用索引，用了内存缓冲 | ⚠️ 差 |

::: danger Using filesort 是什么意思
不是"用文件排序"，而是"**无法利用索引顺序，需要额外排序**"。
数据量小时在内存排（快排），数据量大时落磁盘（很慢）。

**解法：给 ORDER BY 的列建索引，且顺序与索引一致。**
```sql
-- 索引 (status, id)
SELECT * FROM book WHERE status = 1 ORDER BY id DESC;   -- ✓ 走索引顺序
SELECT * FROM book WHERE status = 1 ORDER BY price;     -- ✗ filesort
```
:::

### 慢查询日志

```sql
-- 开启
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;              -- 超过 1 秒记录
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL log_queries_not_using_indexes = ON;

-- 查看
SHOW VARIABLES LIKE 'slow_query%';
```

分析工具：
```bash
# mysqldumpslow（自带）
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# pt-query-digest（Percona，更强）
pt-query-digest /var/log/mysql/slow.log
```

### 优化五步法

::: key 遇到慢查询怎么查
**① 用 EXPLAIN 看执行计划**
```sql
EXPLAIN SELECT ...;
```
重点看：`type` 是否 ALL、`key` 是否为 NULL、`rows` 是否巨大、`Extra` 是否有 filesort/temporary。

**② 看是否走了索引**
```sql
-- 如果 key = NULL，检查：
-- ① WHERE 列有没有索引
-- ② 有没有函数包裹列
-- ③ 有没有隐式类型转换
-- ④ LIKE 是否以 % 开头
-- ⑤ 是否违反最左前缀
```

**③ 考虑覆盖索引**
把 SELECT 需要的列加入索引，消除回表。

**④ 减少扫描行数**
加更精确的 WHERE 条件；避免 `SELECT *`；分页改 cursor。

**⑤ 拆解复杂查询**
大 JOIN 拆成多次小查询 + 应用层组装；子查询改 JOIN。
:::

::: tip 优化的优先级（收益从大到小）
1. **加/改索引**（收益最大，改动最小）
2. **改 SQL 写法**（避免函数包裹、隐式转换、深分页）
3. **减少返回数据**（不要 SELECT *、加 LIMIT）
4. **改表结构**（拆分大表、加冗余字段）
5. **加缓存**（Redis）
6. **读写分离 / 分库分表**（最后手段，成本最高）
:::

---

## 九、范式与表设计

### 三范式

| 范式 | 要求 | 违例 |
|---|---|---|
| **1NF** | 每列不可再分 | `phone: "138,139"` 存多个值 |
| **2NF** | 非主键列完全依赖主键（消除部分依赖） | 联合主键 (order_id, book_id) 里存 book_title |
| **3NF** | 非主键列不依赖其他非主键列（消除传递依赖） | book 表里存 category_name（依赖 category_id） |

```sql
-- ✗ 违反 3NF：category_name 依赖 category_id，不直接依赖 id
CREATE TABLE book (
    id BIGINT PRIMARY KEY,
    title VARCHAR(200),
    category_id BIGINT,
    category_name VARCHAR(50)      -- 冗余！
);

-- ✓ 拆表
CREATE TABLE book (id, title, category_id);
CREATE TABLE category (id, name);
```

### 什么时候故意反范式

::: key 反范式的三个正当理由
**① 性能（避免 JOIN）**
订单表冗余 `book_title`、`book_price`（下单时的价格，而不是现在的价格 —— 这其实是业务需求）。

**② 历史快照**
订单里的商品价格必须是"下单当时的价格"，不能随商品调价而变。
**这不是冗余，这是业务正确性要求。**

**③ 简化查询**
报表统计频繁需要分类名，每次 JOIN 成本高 → 冗余一列。
:::

::: warn 反范式的代价
1. **一致性风险**：分类改名了，book 表里的 category_name 还是旧的
2. **写入放大**：改一个分类名要更新所有相关 book
3. **需要同步机制**：触发器 / 应用层双写 / 定时任务

**只在"读远多于写"且"能接受最终一致"时反范式。**
:::

### 表设计检查清单

```
□ 主键：自增 BIGINT 还是 UUID？
   - 自增：索引友好、有序、占空间小；但分库分表/迁移困难、可被枚举
   - UUID：全局唯一；但无序（B+ 树插入随机 → 页分裂）、占空间大
   - 推荐：自增 BIGINT（单库）+ 雪花算法 ID（分布式）

□ 必备字段
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   deleted TINYINT DEFAULT 0（软删除，见下）

□ 金额用 DECIMAL
□ 状态用 TINYINT + 注释说明每个值的含义
□ 索引：外键列、高频查询列、排序列
□ 字符集：utf8mb4（不是 utf8！）
□ 引擎：InnoDB（支持事务、行锁、外键）
```

::: danger utf8 不是 utf8mb4
MySQL 的 `utf8` 是**残缺的 UTF-8**（最多 3 字节），存不了 emoji（4 字节）。
插入 emoji 会报错 `Incorrect string value`。

**规则：永远用 `utf8mb4` + `utf8mb4_0900_ai_ci`（MySQL 8 默认排序规则）。**
:::

::: compare 物理删除 vs 软删除
| | 物理删除 `DELETE` | 软删除 `UPDATE deleted=1` |
|---|---|---|
| 数据可恢复 | ❌ | ✅ |
| 表体积 | 小 | 持续膨胀 |
| 唯一索引 | 正常 | ⚠️ 冲突（删了再加同名会撞唯一键） |
| 查询 | 简单 | 每个查询都要加 `WHERE deleted=0` |

**软删除的唯一索引冲突解法：**
```sql
-- 方案：把唯一键和删除标记组合
UNIQUE KEY uk_card_deleted (card_no, deleted)
-- 删除时 deleted 设为 id（而不是 1），这样同一个 card_no 可以删多次
UPDATE reader SET deleted = id WHERE id = 5;
```
:::

---

## 十、窗口函数

::: key 窗口函数 vs GROUP BY
- `GROUP BY`：把多行**压缩**成一行（聚合）
- **窗口函数**：保留每一行，额外**附加**一个计算值

```sql
-- GROUP BY：每个分类 1 行
SELECT category_id, AVG(price) FROM book GROUP BY category_id;

-- 窗口函数：每本书 1 行，多一列"本分类均价"
SELECT id, title, price, AVG(price) OVER (PARTITION BY category_id) AS cat_avg
FROM book;
```
:::

### 语法

```sql
函数名() OVER (
    PARTITION BY 分组列     -- 类似 GROUP BY，但保留原行
    ORDER BY 排序列         -- 窗口内排序
    ROWS/RANGE BETWEEN ...  -- 窗口范围
)
```

### 常用窗口函数

```sql
-- ① 排名三兄弟
SELECT
    title, price,
    ROW_NUMBER()  OVER (ORDER BY price DESC) AS 行号,        -- 1,2,3,4（不重复）
    RANK()        OVER (ORDER BY price DESC) AS 排名,        -- 1,2,2,4（并列跳号）
    DENSE_RANK()  OVER (ORDER BY price DESC) AS 密集排名     -- 1,2,2,3（并列不跳号）
FROM book;
```

::: key 三个排名的区别（必考）
价格：139, 149, 149, 119

| 函数 | 结果 |
|---|---|
| `ROW_NUMBER()` | 1, 2, 3, 4 |
| `RANK()` | 1, 2, 2, 4 |
| `DENSE_RANK()` | 1, 2, 2, 3 |

**分页/去重必须用 ROW_NUMBER（唯一）；排行榜用 RANK/DENSE_RANK。**
:::

```sql
-- ② 分组内排名（每个分类价格 Top 2）
SELECT * FROM (
    SELECT title, category_id, price,
           ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY price DESC) AS rn
    FROM book
) t WHERE rn <= 2;
```

```sql
-- ③ 累计与移动平均
SELECT id, price,
    SUM(price) OVER (ORDER BY id) AS 累计和,
    AVG(price) OVER (ORDER BY id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS 近3行均值
FROM book;
```

```sql
-- ④ 前后行对比（LAG / LEAD）
SELECT id, price,
    LAG(price)  OVER (ORDER BY id) AS 上一行价格,
    price - LAG(price) OVER (ORDER BY id) AS 涨跌,
    LEAD(price) OVER (ORDER BY id) AS 下一行价格
FROM book;
```

```sql
-- ⑤ 占比
SELECT title, price,
    ROUND(price * 100.0 / SUM(price) OVER (), 2) AS 占比百分比
FROM book;
```

::: warn 窗口函数不能用在 WHERE 里
```sql
-- ✗ 报错：窗口函数在 SELECT 阶段才计算，WHERE 早执行了
SELECT * FROM (SELECT *, ROW_NUMBER() OVER (...) rn FROM book) t WHERE rn <= 2;
-- ✓ 必须包一层子查询
```
原因就是执行顺序：`FROM → WHERE → GROUP BY → HAVING → 窗口函数 → SELECT → ORDER BY`。
:::

---

## 十一、SQL 注入与防护

### 注入是怎么发生的

```java
// ✗ 拼接字符串
String sql = "SELECT * FROM users WHERE username = '" + input + "'";
```

用户输入 `' OR '1'='1`：
```sql
SELECT * FROM users WHERE username = '' OR '1'='1'
-- → 返回所有用户（'1'='1' 永远为真）
```

用户输入 `admin'; DROP TABLE users; --`：
```sql
SELECT * FROM users WHERE username = 'admin'; DROP TABLE users; --'
-- → 删表！
```

### 五种注入类型

```sql
-- ① 布尔盲注：靠 true/false 差异猜数据
' AND (SELECT SUBSTRING(password,1,1) FROM users WHERE id=1)='a' --

-- ② 时间盲注：靠响应时间猜
' AND IF((SELECT SUBSTRING(password,1,1) FROM users WHERE id=1)='a', SLEEP(3), 0) --

-- ③ 联合查询：直接把数据拼到结果里
' UNION SELECT username, password FROM users --

-- ④ 报错注入：靠错误信息泄露
' AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT version()))) --

-- ⑤ 堆叠查询：执行多条（需要驱动支持）
'; DELETE FROM users WHERE id=1; --
```

### 唯一正确的防护：预编译

```java
// ✓ PreparedStatement
String sql = "SELECT * FROM users WHERE username = ? AND password = ?";
PreparedStatement ps = conn.prepareStatement(sql);
ps.setString(1, username);
ps.setString(2, password);
```

::: key 为什么预编译能防注入（原理）
预编译分两步：
1. **发送 SQL 模板**给数据库 → 数据库**先编译好执行计划**（此时 SQL 结构已固定）
2. **再传参数值** → 值只作为"数据"，**永远不会被当成 SQL 语法解析**

所以用户输入 `' OR '1'='1`，数据库只会去找"用户名恰好等于这串字符"的记录 —— 找不到。

**关键：SQL 的"结构"和"数据"彻底分离了。**
:::

::: danger 拼接字符串的每一种形式都危险
```java
// ✗ 用 + 拼
"SELECT * FROM t WHERE a = '" + v + "'"

// ✗ 用 String.format
String.format("SELECT * FROM t WHERE a = '%s'", v)

// ✗ 用 StringBuilder
sb.append("WHERE a = '").append(v).append("'")

// ✗ 手动转义（容易漏）
v.replace("'", "''")      // 只处理了单引号，还有反斜杠、宽字节注入等
```
只要值进入了 SQL 字符串本身，就有风险。**必须用占位符。**
:::

### MyBatis 的 `#{}` 与 `${}`

```xml
<!-- ✓ #{} → 预编译占位符，安全 -->
<select id="findByName">
    SELECT * FROM book WHERE title = #{title}
</select>
<!-- 实际执行的 SQL：SELECT * FROM book WHERE title = ? -->
```

```xml
<!-- ✗ ${} → 字符串拼接，危险 -->
<select id="findByName">
    SELECT * FROM book WHERE title = '${title}'
</select>
<!-- 实际执行的 SQL：SELECT * FROM book WHERE title = 'xxx' -->
```

::: warn ${} 只能用在这两个地方（且必须白名单校验）
```xml
<!-- ① 动态表名 -->
SELECT * FROM ${tableName}

<!-- ② 动态列（排序字段） -->
ORDER BY ${sortColumn} ${sortDir}
```
这两处占位符**无法用 #{} 代替**（表名/列名不能用参数）。所以必须：

```java
// Service 层白名单校验
private static final Set<String> ALLOWED_SORT = Set.of("id", "title", "price", "created_at");
if (!ALLOWED_SORT.contains(sortBy)) throw new BizException(ResultCode.PARAM_INVALID);
```
:::

### 纵深防御（不只靠预编译）

```
① 预编译参数化         ← 根本手段
② 输入白名单校验       ← 排序字段、表名、枚举值
③ 最小权限的数据库账号 ← 业务账号只给 CRUD，不给 DROP
④ 错误信息不暴露       ← 不要把 SQL 异常直接返回给前端
⑤ WAF / 网关过滤       ← 兜底
⑥ 定期扫描（sqlmap）   ← 主动发现
```

::: danger 一个真实的权限事故
某系统用 `root` 账号连数据库。一个**只读查询接口**被注入后，
攻击者执行了 `DROP TABLE orders`。

如果那个账号只有 `SELECT` 权限，攻击者最多读数据，改不了结构。
**生产环境的业务账号绝不能用 root。**
:::

---

## 十二、本节速查

```sql
-- 建表
CREATE TABLE t (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  name VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_name (name),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 查询骨架（注意执行顺序）
FROM/JOIN → WHERE → GROUP BY → HAVING → 窗口函数 → SELECT → ORDER BY → LIMIT

-- JOIN
INNER 交集 | LEFT 保左 | RIGHT 保右 | CROSS 笛卡尔
LEFT JOIN 的右表条件写 ON，不要写 WHERE

-- 聚合
COUNT(*) 行数 / COUNT(col) 非NULL数
WHERE 过滤行（分组前）/ HAVING 过滤组（分组后）

-- 事务
ACID：undo log（原子）/ redo log（持久）/ 锁+MVCC（隔离）
隔离级别：RU < RC < RR（InnoDB默认）< SERIAL
并发现象：脏读 / 不可重复读 / 幻读
事务要短；扣库存用 UPDATE ... WHERE stock > 0 判断 affectedRows

-- 索引
聚簇索引叶子存整行；二级索引叶子存主键 → 回表
覆盖索引免回表（Extra: Using index）
最左前缀：从最左连续用，遇范围止
失效：函数包裹、隐式转换、前导%、NOT、OR

-- EXPLAIN
type: system > const > eq_ref > ref > range > index > ALL
Extra: Using index（好）| Using filesort / Using temporary（差）
rows 越小越好

-- 注入
唯一根本解：预编译（#{}），结构永远不被用户输入污染
${} 只用于表名/列名，必须白名单
业务账号最小权限，错误信息不外泄

-- 窗口函数
ROW_NUMBER（唯一）/ RANK（跳号）/ DENSE_RANK（不跳号）
不能出现在 WHERE，需子查询包一层
```

::: interview 面试高频
**Q：为什么 MySQL 用 B+ 树而不是 B 树 / 哈希 / 二叉树？**
A：哈希只能等值查不能范围；二叉树数据量大时树太深 IO 太多；
B 树非叶子节点也存数据，单节点键少，树更高。
B+ 树非叶子只存键（单页存更多键 → 树更矮）+ 叶子节点双向链表（范围查询快）。

**Q：什么是回表？怎么避免？**
A：二级索引叶子只存索引列+主键，需要其他列时要再查聚簇索引 = 两次 B+ 树查找。
避免方式：覆盖索引（把需要的列建进索引，Extra 显示 `Using index`）。

**Q：最左前缀原则？**
A：联合索引 (a,b,c) 只能从 a 开始连续使用；跳过 a 或 b 都无法用；遇到范围查询后，
后续列无法用于过滤（但可能用于排序）。口诀"最左优先，遇范围止"。

**Q：InnoDB 默认可重复读，怎么解决幻读？**
A：快照读靠 MVCC（读事务开始时的版本链快照）；当前读（FOR UPDATE/UPDATE/DELETE）
靠 Next-Key Lock（记录锁 + 间隙锁）锁住范围，阻止插入。

**Q：不可重复读和幻读的区别？**
A：不可重复读是同一行的内容变了（UPDATE），幻读是同一范围的行数变了（INSERT/DELETE）。
前者锁行即可，后者需要锁范围（间隙锁）。

**Q：为什么 UPDATE 要判断 affectedRows？**
A：`UPDATE book SET stock=stock-1 WHERE id=? AND stock>0` 在库存为 0 时
影响行数为 0，据此判断失败并抛异常。这比"先 SELECT 再判断"原子性更强，避免超卖。

**Q：`#{}` 和 `${}` 的区别？**
A：`#{}` 是 PreparedStatement 占位符（预编译，防注入）；
`${}` 是字符串直接拼接（可注入）。`${}` 只能用于表名/列名等无法参数化的位置，且必须白名单校验。
:::

---

## 延伸练习

1. 在本工坊的 `sql_lab` 库建一套表（图书/读者/借阅），并插入 20 条测试数据。
2. 用五种 JOIN 各写一条查询，输出结果并解释差异。
3. 用窗口函数：每个分类价格 Top 3、每本书价格与本分类均价的差、累计借阅量。
4. 造 10 万行数据，用 `EXPLAIN` 对比 `WHERE id=1`、`WHERE title LIKE 'Java%'`、
   `WHERE title LIKE '%Java%'`、`WHERE DATE(created_at)='2026-10-25'` 的执行计划。
5. 开两个会话，演示不可重复读和幻读（一个会话改/插，另一个会话读）。
6. 复现 SQL 注入：用 `Statement` 拼接 `' OR '1'='1`，再用 `PreparedStatement` 证明防住了。
7. 做一次"超卖"实验：两个会话同时执行"先查再改"，观察超卖；再改成条件更新，验证修复。

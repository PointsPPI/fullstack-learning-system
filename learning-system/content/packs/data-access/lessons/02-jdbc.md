# JDBC

::: key 一句话抓住本质
JDBC 是 Java 访问数据库的**标准接口**（一套 interface），具体实现由各家数据库驱动提供。
它很简单，但**原始到令人痛苦** —— 理解这份痛苦，才知道 MyBatis 为什么存在。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 六步流程 | 连接、语句、结果集、关闭 |
| 2 | Statement vs PreparedStatement | 预编译是安全的分界线 |
| 3 | SQL 注入对照实验 | 亲手复现再亲手防住 |
| 4 | 事务与回滚 | `setAutoCommit(false)` |
| 5 | 连接池 | 为什么不能每次新建连接 |
| 6 | DAO 模式与资源关闭 | try-with-resources |

---

## 一、六步流程

```java
public class JdbcDemo {
    // 六步走完，才算一次完整的数据库访问
    public static void main(String[] args) throws Exception {
        // ① 加载驱动（JDBC 4.0+ 可省略，SPI 自动发现）
        Class.forName("com.mysql.cj.jdbc.Driver");

        // ② 建立连接
        String url = "jdbc:mysql://127.0.0.1:3307/bookhub"
                   + "?useUnicode=true&characterEncoding=utf8"
                   + "&serverTimezone=Asia/Shanghai"
                   + "&useSSL=false&allowPublicKeyRetrieval=true";
        Connection conn = DriverManager.getConnection(url, "bh", "bh_pwd_2026");

        // ③ 创建语句对象
        PreparedStatement ps = conn.prepareStatement(
            "SELECT id, title, author, price FROM book WHERE category_id = ?");

        // ④ 设置参数 + 执行
        ps.setLong(1, 1L);
        ResultSet rs = ps.executeQuery();

        // ⑤ 处理结果集
        while (rs.next()) {
            System.out.printf("%d  %-30s  %-20s  %8.2f%n",
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("author"),
                rs.getBigDecimal("price"));
        }

        // ⑥ 关闭资源（逆序关闭）
        rs.close();
        ps.close();
        conn.close();
    }
}
```

::: key 每一步在做什么
| 步骤 | 做了什么 | 常见错误 |
|---|---|---|
| ① 加载驱动 | 把 Driver 实现注册到 DriverManager | JDBC 4 之后可省略（SPI 自动） |
| ② 建连接 | **TCP 连接 + 认证 + 会话建立**（最贵的一步） | URL 参数写错 → 时区/SSL 报错 |
| ③ 创建语句 | 数据库**预编译** SQL（服务端解析 + 生成执行计划） | 用 Statement 拼接字符串 → 注入 |
| ④ 执行 | 发参数 → 数据库执行 | 忘了 set 参数 → SQLException |
| ⑤ 处理结果 | 逐行读取，**游标前进** | `rs.next()` 忘了写在 while 里 |
| ⑥ 关闭 | 释放结果集 → 语句 → 连接 | **忘了关 → 连接泄漏，最终连接池耗尽** |
:::

### URL 参数详解

```
jdbc:mysql://host:port/database?key=value&key=value
     ↑协议      ↑主机 ↑端口  ↑库名
```

| 参数 | 作用 | 为什么需要 |
|---|---|---|
| `useUnicode=true&characterEncoding=utf8` | 字符编码 | 不写可能中文乱码 |
| `serverTimezone=Asia/Shanghai` | 服务端时区 | MySQL 8 驱动**必填**，否则报错 |
| `useSSL=false` | 关闭 SSL | 本地开发免配证书 |
| `allowPublicKeyRetrieval=true` | 允许获取公钥 | MySQL 8 默认 `caching_sha2_password`，不开启会连不上 |
| `rewriteBatchedStatements=true` | 批量插入优化 | 不开的话批处理还是一条条发 |
| `zeroDateTimeBehavior=convertToNull` | `0000-00-00` 转 null | 老数据兼容 |

::: danger MySQL 8 驱动的三个必踩坑
```
# ① 没写时区
The server time zone value '中国标准时间' is unrecognized
→ 加 serverTimezone=Asia/Shanghai

# ② 认证插件不兼容
Public Key Retrieval is not allowed
→ 加 allowPublicKeyRetrieval=true

# ③ SSL 握手失败（自签证书环境）
→ 加 useSSL=false（仅开发环境！）
```
:::

---

## 二、Statement vs PreparedStatement

::: compare 本质区别
| | `Statement` | `PreparedStatement` |
|---|---|---|
| SQL 传入时机 | 执行时传完整 SQL 字符串 | 创建时传**模板**，执行时只传参数 |
| 预编译 | ❌ 每次都要解析 | ✅ 只解析一次 |
| 参数 | 无（自己拼字符串） | `setXxx(index, value)` |
| **SQL 注入** | **有风险** | **免疫** |
| 性能（重复执行） | 每次重新解析 | 复用执行计划，更快 |
| 批量操作 | 慢 | 快（`addBatch`） |
| 类型安全 | 手拼字符串，易错 | 类型由 `setXxx` 保证 |
:::

### 危险写法 vs 安全写法

```java
// ══════════ ✗ 危险：Statement 拼接 ══════════
String name = request.getParameter("name");
String sql = "SELECT * FROM book WHERE title = '" + name + "'";
Statement st = conn.createStatement();
ResultSet rs = st.executeQuery(sql);

// 用户输入：' OR '1'='1
// 实际执行：SELECT * FROM book WHERE title = '' OR '1'='1'
//           → 返回全部记录（条件永远为真）
```

```java
// ══════════ ✓ 安全：PreparedStatement ══════════
String sql = "SELECT * FROM book WHERE title = ?";
PreparedStatement ps = conn.prepareStatement(sql);
ps.setString(1, name);
ResultSet rs = ps.executeQuery();

// 用户输入：' OR '1'='1
// 数据库只会找"标题恰好等于这 9 个字符"的记录 → 找不到
```

::: key 为什么预编译免疫注入 —— 关键在于"执行顺序"
```
Statement：
  ① 拼字符串 → "SELECT ... WHERE title = '' OR '1'='1'"
  ② 发送整串给数据库
  ③ 数据库解析 → 发现 OR 条件 → 执行

PreparedStatement：
  ① 只发送模板 → "SELECT ... WHERE title = ?"
  ② 数据库**先解析模板**，执行计划已固定（就是"按 title 等值查"）
  ③ 再发送参数值 "' OR '1'='1"
  ④ 数据库把参数当成**纯数据**填充 → 不会重新解析 → 注入无效
```

**核心：SQL 的"结构"在参数到来之前就已经固定了，参数永远无法改变结构。**
:::

::: danger 一个反直觉的事实
`PreparedStatement` 并不是"把参数转义了"，而是"参数根本没进入 SQL 语法层"。

所以这些"绕过转义"的技巧对预编译都无效：
- 宽字节注入 `%bf%27`（利用 GBK 编码）
- 反斜杠绕过 `\`
- 注释绕过 `/**/`
- 大小写/编码绕过

**只要用了参数化查询，这些全都不用担心。**
:::

### 参数设置方法

```java
ps.setString(1, "abc");
ps.setInt(2, 42);
ps.setLong(3, 9999L);
ps.setBigDecimal(4, new BigDecimal("99.99"));
ps.setBoolean(5, true);
ps.setDate(6, java.sql.Date.valueOf("2026-10-25"));
ps.setTimestamp(7, java.sql.Timestamp.valueOf("2026-10-25 10:30:00"));
ps.setNull(8, Types.VARCHAR);
ps.setObject(9, null);       // 让驱动自己推断类型（谨慎用）
```

::: warn 索引从 1 开始，不是 0
```java
ps.setString(0, "x");    // ✗ SQLException: Parameter index out of range
ps.setString(1, "x");    // ✓
```
这是 JDBC 里最容易手误的地方。
:::

### 批量操作

```java
String sql = "INSERT INTO book (title, author, category_id, price, total) VALUES (?,?,?,?,?)";
try (PreparedStatement ps = conn.prepareStatement(sql)) {
    conn.setAutoCommit(false);           // 关掉自动提交，避免每条都提交

    for (int i = 0; i < books.size(); i++) {
        ps.setString(1, books.get(i).getTitle());
        ps.setString(2, books.get(i).getAuthor());
        ps.setLong(3, books.get(i).getCategoryId());
        ps.setBigDecimal(4, books.get(i).getPrice());
        ps.setInt(5, books.get(i).getTotal());
        ps.addBatch();                    // 加入批次

        if (i % 500 == 0) {               // 每 500 条执行一次（防内存爆）
            ps.executeBatch();
        }
    }
    ps.executeBatch();
    conn.commit();
}
```

::: danger 不开 rewriteBatchedStatements 的批量插入等于没批量
```java
// URL 里加了这个参数
URL: ...&rewriteBatchedStatements=true
```

不加的话，驱动虽然接受 `addBatch`，但实际还是**一条一条发给服务器**。
10000 条插入：加了约 0.5 秒，不加约 60 秒。**120 倍差距。**
:::

---

## 三、SQL 注入对照实验

::: lab 亲手做一遍（10 分钟）
用一个真实的登录场景，对比两种实现。

**准备数据：**
```sql
INSERT INTO reader (card_no, name, phone, status) VALUES
('R001', '张三', '13800000001', 1),
('R002', '李四', '13800000002', 1);
```

**✗ 版本 1：Statement 拼接**
```java
public boolean loginUnsafe(String cardNo, String name) throws Exception {
    String sql = "SELECT * FROM reader WHERE card_no = '" + cardNo
               + "' AND name = '" + name + "'";
    System.out.println("[SQL] " + sql);
    try (Statement st = conn.createStatement();
         ResultSet rs = st.executeQuery(sql)) {
        return rs.next();
    }
}
```

**攻击测试：**
```java
// 正常登录（失败）
loginUnsafe("R001", "错误的名字");        // false

// 万能密码
loginUnsafe("x", "x' OR '1'='1");        // true  ← 注入了！
// 实际 SQL: SELECT * FROM reader WHERE card_no = 'x' AND name = 'x' OR '1'='1'
//           OR 的优先级低，所以整条条件恒真

// 更狠的：绕过一切
loginUnsafe("' OR '1'='1' -- ", "x");    // true
```

**✓ 版本 2：PreparedStatement**
```java
public boolean loginSafe(String cardNo, String name) throws Exception {
    String sql = "SELECT * FROM reader WHERE card_no = ? AND name = ?";
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
        ps.setString(1, cardNo);
        ps.setString(2, name);
        try (ResultSet rs = ps.executeQuery()) {
            return rs.next();
        }
    }
}
```

**同样的攻击：**
```java
loginSafe("x", "x' OR '1'='1");          // false  ← 防住了
loginSafe("' OR '1'='1' -- ", "x");      // false  ← 防住了
```
:::

::: danger 不要试图"自己转义"来防注入
```java
// ✗ 这些都是错的
input.replace("'", "''")                  // 漏了反斜杠、宽字节
input.replaceAll("['\"]", "")             // 破坏合法数据
if (input.contains("'")) reject();        // 误杀（名字里真有单引号）
```
正确做法只有一条：**参数化查询**。
:::

---

## 四、事务与回滚

### 手动事务

```java
Connection conn = null;
try {
    conn = dataSource.getConnection();

    // ① 关闭自动提交（关键）
    conn.setAutoCommit(false);

    // ② 设置隔离级别（可选）
    conn.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);

    // ③ 业务操作 1：扣库存
    try (PreparedStatement ps = conn.prepareStatement(
            "UPDATE book SET stock = stock - 1 WHERE id = ? AND stock > 0")) {
        ps.setLong(1, bookId);
        if (ps.executeUpdate() == 0) {
            throw new BizException("库存不足");     // 抛出 → 回滚
        }
    }

    // ④ 业务操作 2：插入借阅记录
    try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO borrow (book_id, reader_id, borrow_date, due_date) VALUES (?,?,?,?)")) {
        ps.setLong(1, bookId);
        ps.setLong(2, readerId);
        ps.setDate(3, java.sql.Date.valueOf(LocalDate.now()));
        ps.setDate(4, java.sql.Date.valueOf(LocalDate.now().plusDays(30)));
        ps.executeUpdate();
    }

    // ⑤ 提交
    conn.commit();
    System.out.println("借阅成功");

} catch (Exception e) {
    // ⑥ 回滚
    if (conn != null) {
        try { conn.rollback(); } catch (SQLException ex) { /* 记录日志 */ }
    }
    throw new RuntimeException(e);

} finally {
    // ⑦ 恢复自动提交 + 归还连接
    if (conn != null) {
        try { conn.setAutoCommit(true); } catch (SQLException ignored) { }
        try { conn.close(); } catch (SQLException ignored) { }
    }
}
```

::: key 三个必须做的事
1. **`setAutoCommit(false)`** —— 不开就不是事务，每条 SQL 自动提交
2. **`rollback()`** —— 异常时必须回滚，否则部分修改已生效
3. **`setAutoCommit(true)` + `close()`** —— 不恢复状态就归还连接池，下一个使用者会继承这个"未提交事务"
:::

::: danger 最隐蔽的事务 bug：忘记恢复 autoCommit
```java
// ✗ 连接池场景
conn.setAutoCommit(false);
// ... 业务异常 ...
finally {
    conn.close();       // 归还给连接池，但 autoCommit 还是 false
}

// 下一个请求从池里拿到这个连接
conn.prepareStatement("INSERT ...").executeUpdate();   // 没提交！
// → 数据看起来"没存进去"，但代码没报错，排查几小时
```
现代连接池（HikariCP）会在归还时重置，但**不要依赖它** —— 显式恢复是防御性编程。
:::

### Savepoint（部分回滚）

```java
conn.setAutoCommit(false);
try (PreparedStatement ps = conn.prepareStatement("INSERT INTO log ...")) { ps.executeUpdate(); }

Savepoint sp = conn.setSavepoint("afterLog");   // 打一个标记

try {
    // 可能失败的操错
    doSomethingRisky(conn);
    conn.commit();
} catch (Exception e) {
    conn.rollback(sp);        // 只回滚到标记点，不撤销前面的日志
    conn.commit();            // 提交日志部分
}
```

---

## 五、连接池原理

### 为什么不能用 DriverManager 每次新建

::: key 建立一次连接的代价
```
TCP 三次握手              ~1ms（本地）/ ~30ms（跨地域）
MySQL 认证（密码校验）    ~1ms
会话初始化（字符集、时区、参数） ~1ms
──────────────────────────────────
合计                      ~3ms（本地）/ ~30ms+（远程）
```

一个接口执行 10 条 SQL = 10 次连接 = 30ms 纯开销。
100 QPS 的接口 → 每秒 300ms 花在建连接上。

**连接池的做法：启动时建好 N 个连接，用完归还，复用。**
:::

### HikariCP（Spring Boot 默认）

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3307/bookhub
    username: bh
    password: bh_pwd_2026
    hikari:
      maximum-pool-size: 10            # 最大连接数
      minimum-idle: 2                  # 最小空闲（保持预热）
      connection-timeout: 3000         # 从池里拿连接的超时（毫秒）
      idle-timeout: 600000             # 空闲多久被回收（10分钟）
      max-lifetime: 1800000            # 连接最大存活时间（30分钟，必须小于 MySQL 的 wait_timeout）
      connection-test-query: SELECT 1  # 校验连接有效
```

::: danger 连接池大小不是越大越好
```yaml
maximum-pool-size: 100    # ✗ 常见误区
```

**原因：**
1. 数据库连接数有上限（`max_connections` 默认 151）
2. 每个连接占用 5-10MB 内存（数据库侧）
3. 连接多 → 上下文切换频繁 → **性能反而下降**

**公式（HikariCP 官方建议）：**
```
connections = ((core_count × 2) + effective_spindle_count)
```
8 核机器 → 约 17 个连接。**10-20 个连接足以支撑几百 QPS。**
:::

::: danger max-lifetime 必须小于 MySQL 的 wait_timeout
```
MySQL 默认 wait_timeout = 28800（8 小时）
HikariCP 默认 max-lifetime = 1800000ms（30 分钟）
```

如果连接池不回收，但 MySQL 主动断了空闲连接，
池里就会有一批"死连接"。下一个请求拿到它 → `Communications link failure`。

**规则：`max-lifetime` < `wait_timeout`（留出余量）**
:::

### 连接池的核心接口

::: compare 三个 DataSource
| 实现 | 特点 |
|---|---|
| `HikariCP` | 最快，Spring Boot 2+ 默认 |
| `Druid` | 功能多（监控、SQL 防火墙），国内常用 |
| `DBCP2` | 老牌，性能一般 |
| `C3P0` | 更老，基本不用了 |

**它们都实现 `javax.sql.DataSource` 接口** —— 这就是面向接口编程的价值：换连接池不改代码。
:::

### 连接泄漏排查

```java
// ✗ 泄漏写法
Connection conn = ds.getConnection();
PreparedStatement ps = conn.prepareStatement(sql);
// 中间抛异常 → 下面的 close 永远不执行 → 连接不归还
ps.executeQuery();
ps.close();
conn.close();
```

```java
// ✓ try-with-resources（AutoCloseable 自动关闭，异常也会关）
try (Connection conn = ds.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql);
     ResultSet rs = ps.executeQuery()) {
    while (rs.next()) { }
}
```

::: warn 连接泄漏的症状
```
HikariPool-1 - Connection is not available, request timed out after 30000ms
```
出现这个错误，说明池里连接全被占着。排查方向：
1. 有没有 try-with-resources
2. 有没有长事务（事务里做了慢操作）
3. 有没有连接没关（框架层面）
4. 池是不是太小（并发确实高）

**开启泄漏检测：**
```yaml
hikari:
  leak-detection-threshold: 20000   # 连接借出 20 秒未归还就打印堆栈
```
:::

---

## 六、DAO 模式与资源关闭

### 朴素 DAO

```java
public class BookDao {
    private final DataSource ds;
    public BookDao(DataSource ds) { this.ds = ds; }

    public List<Book> findByCategory(Long categoryId) throws SQLException {
        String sql = "SELECT id, title, author, price, stock FROM book WHERE category_id = ?";
        List<Book> list = new ArrayList<>();

        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setLong(1, categoryId);

            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    list.add(mapRow(rs));       // ← 映射逻辑抽出来复用
                }
            }
        }
        return list;
    }

    private Book mapRow(ResultSet rs) throws SQLException {
        Book b = new Book();
        b.setId(rs.getLong("id"));
        b.setTitle(rs.getString("title"));
        b.setAuthor(rs.getString("author"));
        b.setPrice(rs.getBigDecimal("price"));
        b.setStock(rs.getInt("stock"));
        return b;
    }
}
```

::: key ResultSet 映射的六个坑
```java
rs.getLong("id")            // 列不存在 → SQLException
rs.getLong(1)               // 按索引（从 1 开始，顺序依赖 SQL，脆弱）

// ① 数值列为 NULL 时 getInt 返回 0，无法区分"0"和"NULL"
if (rs.getObject("stock") != null) { ... }      // ✓ 用 getObject 判断

// ② getDate 返回 java.sql.Date，可能有时区问题
rs.getObject("borrow_date", LocalDate.class)    // ✓ JDBC 4.2+ 直接转 LocalDate

// ③ 列名大小写不敏感，但别名要一致
SELECT category_id AS categoryId    // 别名要能在 rs 里取到

// ④ getString 在列为 NULL 时返回 null（不是空串）

// ⑤ 游标只能前进，不能后退（rs.next() 只能一遍）
// ⑥ 大结果集要分批处理，否则 OOM
```

:::

### 资源关闭的正确顺序

```java
// 逆序关闭：ResultSet → Statement → Connection
try (Connection conn = ds.getConnection();          // 最后关
     PreparedStatement ps = conn.prepareStatement(sql);  // 中间关
     ResultSet rs = ps.executeQuery()) {            // 最先关
    // try-with-resources 会自动逆序关闭（声明顺序的反序）
}
```

::: warn 新建 Connection 不该在 try-with-resources 里？
其实可以，而且推荐。但要理解：
- `Connection` 实现 `AutoCloseable`，`close()` 会**归还到池**（不是真的断开）
- 关闭顺序：rs → ps → conn，try-with-resources 自动按**声明顺序的逆序**关闭

所以声明顺序必须是 conn → ps → rs（从外到内），关闭时才是 rs → ps → conn。
:::

### JDBC 之痛（为什么需要 MyBatis）

::: compare 手写 JDBC 的六件苦差事
| 痛点 | 具体表现 | MyBatis 怎么解决 |
|---|---|---|
| 样板代码多 | 每个方法都要 try-with-resources + setXxx + while(rs.next()) | Mapper 接口一行方法签名 |
| 结果集映射 | 手动 `rs.getXxx` 十几行 | `resultMap` / 驼峰自动映射 |
| SQL 散落 | SQL 拼在 Java 里，难维护 | XML 集中管理 |
| 参数绑定 | 索引从 1 开始，易错 | `#{name}` 按名字绑定 |
| 动态条件 | 一堆 `if` 拼字符串 | `<if>` `<where>` `<foreach>` |
| 分页 | 手写 count + limit | PageHelper 一行搞定 |
:::

**所以演进路线是：**
```
JDBC（原生，痛苦但理解本质）
  ↓
JdbcTemplate（Spring 封装，省样板代码，但 SQL 还是手拼）
  ↓
MyBatis（半自动 ORM，SQL 可控 + 映射自动）
  ↓
JPA / Hibernate（全自动 ORM，不写 SQL，但复杂查询难控制）
```

**本工坊先讲 JDBC 再讲 MyBatis，就是为了让你知道 MyBatis "省掉的到底是什么"。**

---

## 七、本节速查

```java
// 六步
Class.forName(driver)  // 可省
conn = DriverManager.getConnection(url, user, pwd)
ps = conn.prepareStatement(sql)
ps.setXxx(i, val)      // 索引从 1 开始
rs = ps.executeQuery() // 或 executeUpdate() 返回影响行数
while (rs.next()) { ... }
// 关闭：rs → ps → conn（try-with-resources）

// URL 必带参数（MySQL 8）
?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
&useSSL=false&allowPublicKeyRetrieval=true&rewriteBatchedStatements=true

// Statement vs PreparedStatement
Statement：拼字符串 → 可注入
PreparedStatement：模板 + 参数 → 免疫注入（结构先固定，参数永不进语法层）

// 事务
conn.setAutoCommit(false)
try { ...; conn.commit(); }
catch { conn.rollback(); }
finally { conn.setAutoCommit(true); conn.close(); }

// 批量
addBatch() / executeBatch() + rewriteBatchedStatements=true（否则等于没批量）

// 连接池（HikariCP）
maximum-pool-size: 10~20（不是越大越好）
max-lifetime < MySQL wait_timeout
leak-detection-threshold 排查泄漏
```

::: interview 面试高频
**Q：JDBC 的六步？**
A：加载驱动 → 建立连接 → 创建语句 → 设置参数执行 → 处理结果集 → 关闭资源（逆序）。

**Q：Statement 和 PreparedStatement 的区别？为什么后者能防注入？**
A：Statement 执行时传完整 SQL 字符串，每次都要解析；PreparedStatement 创建时传模板，
数据库先编译固定执行计划，执行时只传参数。
参数**永远不会被当作 SQL 语法解析**，所以结构无法被改变 —— 这是免疫注入的根本原因。
另外 PreparedStatement 还能复用执行计划、支持批量。

**Q：为什么需要连接池？连接池大小怎么定？**
A：建立连接要 TCP 握手 + 认证 + 会话初始化（几毫秒到几十毫秒），每次新建开销巨大。
连接池复用连接。大小不是越大越好（数据库连接上限、内存、上下文切换），
一般 10-20 个即可，公式约 `(CPU 核数 × 2) + 磁盘数`。

**Q：连接池 max-lifetime 为什么要小于 MySQL 的 wait_timeout？**
A：MySQL 会主动断开空闲超过 wait_timeout 的连接。如果池认为连接还活着但实际已被断开，
下一个请求拿到"死连接"就会报 Communications link failure。
所以池必须更早主动回收。

**Q：try-with-resources 的关闭顺序？**
A：按声明顺序的**逆序**关闭。所以声明应该是 Connection → Statement → ResultSet。

**Q：JDBC 有哪些痛点，MyBatis 解决了什么？**
A：样板代码多、结果集手动映射、SQL 拼在 Java 里、参数索引易错、动态 SQL 难写、分页手写。
MyBatis：Mapper 接口 + XML 集中 SQL + 自动映射 + `#{}` 按名绑定 + 动态标签 + PageHelper。
:::

---

## 延伸练习

1. 用纯 JDBC 写一个 `BookDao`，实现：按分类查询、按 id 查询、新增、更新库存。
2. 复现 SQL 注入：写 `loginUnsafe`（Statement 拼接），输入 `' OR '1'='1` 登录成功；
   再写 `loginSafe`（PreparedStatement）证明防住了。
3. 用 JDBC 手写事务：借书 = 扣库存 + 插记录，故意在第二步抛异常，验证库存已回滚。
4. 批量插入 10000 条数据，分别在 URL 加/不加 `rewriteBatchedStatements=true`，对比耗时。
5. 把 `max-lifetime` 设成 1 秒，等 5 秒后再请求，观察报错信息（模拟死连接）。
6. 对比手写 JDBC 与 MyBatis 实现同一个查询，数一数代码行数差多少。

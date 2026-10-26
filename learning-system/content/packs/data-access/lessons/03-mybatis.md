# MyBatis

::: key 一句话抓住本质
MyBatis 是**半自动 ORM**：SQL 你自己写（保持掌控），但参数的传入和结果集的映射它帮你做。
"半自动"是它最大的优点 —— 复杂查询你能控制 SQL，简单查询不用写样板代码。
:::

## 学习点

| # | 知识点 | 优先级 |
|---|---|---|
| 1 | 核心组件与执行流程 | ★★★ |
| 2 | Mapper 接口与 XML 映射 | ★★★★★ |
| 3 | `#{}` 与 `${}` 的本质区别 | ★★★★★ |
| 4 | resultMap 与驼峰映射 | ★★★★ |
| 5 | 动态 SQL | ★★★★★ |
| 6 | 一对一与一对多 | ★★★★ |
| 7 | 分页实现 | ★★★★ |
| 8 | 一级与二级缓存 | ★★★★ |
| 9 | 常见异常排查 | ★★★★ |

---

## 一、核心组件与执行流程

```
① mybatis-config.xml（或 application.yml）
   → 全局配置：数据源、驼峰、缓存、插件
        ↓
② SqlSessionFactoryBuilder → SqlSessionFactory
   （解析配置 + Mapper XML，生成 Configuration 对象）
        ↓
③ SqlSessionFactory.openSession() → SqlSession
   （一次数据库会话，非线程安全）
        ↓
④ SqlSession.getMapper(BookMapper.class) → 代理对象
        ↓
⑤ 调用 mapper 方法 → 找 MappedStatement → 执行 SQL → 映射结果
```

::: key 一句话理解各组件
| 组件 | 一句话 |
|---|---|
| `Configuration` | 全局配置的运行时表示（所有 MappedStatement 都在这里） |
| `SqlSessionFactory` | 生产 SqlSession 的工厂（**单例**，应用级） |
| `SqlSession` | 一次会话（**非线程安全**，用完即关） |
| `Executor` | 执行器（SIMPLE / REUSE / BATCH） |
| `MappedStatement` | 一条 SQL 的完整描述（id、SQL、参数映射、结果映射） |
| `StatementHandler` | 真正创建 PreparedStatement、设参数、执行 |
| `ResultSetHandler` | 把 ResultSet 映射成 Java 对象 |
:::

```java
// 最原始的用法（理解原理用）
String resource = "mybatis-config.xml";
InputStream is = Resources.getResourceAsStream(resource);
SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(is);

try (SqlSession session = factory.openSession()) {
    BookMapper mapper = session.getMapper(BookMapper.class);
    Book book = mapper.findById(1L);
    session.commit();          // 手动提交（openSession 默认不自动提交）
}
```

::: warn SqlSession 不是线程安全的
```java
// ✗ 绝不能作为类成员
public class BookDao {
    private SqlSession session;    // 并发下必炸
}
```
`SqlSession` 内部有缓存、事务状态、Executor，被多线程共享会数据错乱。

**Spring 集成的做法**：`SqlSessionTemplate` 用 ThreadLocal 保证每个线程一个 SqlSession，
对你完全透明。**所以用 Spring 时你根本见不到 SqlSession。**
:::

---

## 二、Mapper 接口与 XML 映射

### 定义

```java
@Mapper
public interface BookMapper {
    List<Book> findByCategory(@Param("categoryId") Long categoryId);

    Book findById(Long id);

    int insert(Book book);

    int updateStock(@Param("id") Long id, @Param("delta") int delta);

    int deleteById(Long id);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.bookhub.mapper.BookMapper">

    <select id="findByCategory" resultType="com.bookhub.entity.Book">
        SELECT id, title, author, price, stock, total, status, remark
        FROM book
        WHERE category_id = #{categoryId}
    </select>

    <select id="findById" resultType="com.bookhub.entity.Book">
        SELECT * FROM book WHERE id = #{id}
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO book (title, author, isbn, category_id, price, stock, total, status, remark)
        VALUES (#{title}, #{author}, #{isbn}, #{categoryId}, #{price}, #{stock}, #{total}, #{status}, #{remark})
    </insert>

    <update id="updateStock">
        UPDATE book SET stock = stock + #{delta} WHERE id = #{id}
    </update>

    <delete id="deleteById">
        DELETE FROM book WHERE id = #{id}
    </delete>
</mapper>
```

### 四个绑定的硬性要求

::: danger Mapper 接口找不到 XML 的四个原因（按频率）
**① namespace 和接口全限定名不一致**
```xml
<mapper namespace="com.bookhub.mapper.BookMapper">   <!-- 必须一模一样 -->
```
写成 `BookMapper` 或少了包名 → `BindingException: Invalid bound statement (not found)`

**② id 和方法名不一致**
```xml
<select id="findById">    <!-- 必须等于接口方法名 -->
```
写成 `selectById` → 同上异常

**③ XML 没被扫描到**
```yaml
mybatis:
  mapper-locations: classpath:mapper/*.xml     # 检查路径对不对
```
- `classpath:` 只找 `resources` 根下的
- `classpath*:` 会找所有 jar 里的
- 多级目录用 `classpath:mapper/**/*.xml`

**④ 接口没有 @Mapper，也没配 @MapperScan**
```java
@Mapper     // 方式 1：每个接口都标
public interface BookMapper { }

@MapperScan("com.bookhub.mapper")   // 方式 2：启动类上统一扫（推荐）
@SpringBootApplication
public class App { }
```
:::

### 参数传递的五种情况

```java
// ① 单个简单参数：名字无所谓
Book findById(Long id);                      // #{id} 或 #{anything} 都行

// ② 多个简单参数：必须用 @Param，否则只能用 arg0/param1
List<Book> findBy(@Param("kw") String kw, @Param("catId") Long catId);
// → #{kw}, #{catId}

// ③ 单个对象：直接用属性名
int insert(Book book);                        // #{title}, #{author}

// ④ Map
List<Book> search(Map<String, Object> params);   // #{任意 key}

// ⑤ 集合（foreach）
int batchInsert(@Param("list") List<Book> books);
```

::: warn 多参数不加 @Param 会怎样
```java
List<Book> findBy(String kw, Long catId);

// ✗ XML 里写 #{kw} → 报错
// Parameter 'kw' not found. Available parameters are [arg1, arg0, param1, param2]

// 只能写 #{arg0} / #{param1}，代码可读性极差且顺序依赖
```
**规则：多于一个参数，一律加 `@Param`。**
:::

---

## 三、`#{}` 与 `${}` 的本质区别

::: compare 这是 MyBatis 最重要的知识点
| | `#{}` | `${}` |
|---|---|---|
| 实现 | `PreparedStatement` 的 `?` 占位符 | 字符串直接拼接 |
| 安全性 | ✅ 免疫 SQL 注入 | ❌ 有注入风险 |
| 类型处理 | 自动处理（字符串加引号，数字不加） | 原样拼入，要自己加引号 |
| 预编译 | ✅ 复用执行计划 | ❌ 每次重新解析 |
| 适用 | 所有**值**（WHERE 条件、INSERT 值） | 只能用于**标识符**（表名、列名） |
:::

```xml
<!-- ✓ 正确：值是参数 -->
<select id="findByTitle">
    SELECT * FROM book WHERE title = #{title}
</select>
<!-- 生成：SELECT * FROM book WHERE title = ?  → params: ['Java核心技术'] -->
```

```xml
<!-- ✗ 错误：值是拼接 -->
<select id="findByTitle">
    SELECT * FROM book WHERE title = '${title}'
</select>
<!-- 生成：SELECT * FROM book WHERE title = 'Java核心技术' -->
<!-- 输入 ' OR '1'='1 → 万能条件 -->
```

::: lab 亲手对比（5 分钟）
```java
// 输入：x' OR '1'='1
mapper.findByTitleUnsafe("x' OR '1'='1");
// → SELECT * FROM book WHERE title = 'x' OR '1'='1'   → 返回全部 12 条！

mapper.findByTitleSafe("x' OR '1'='1");
// → SELECT * FROM book WHERE title = ?  ['x\' OR \'1\'=\'1']
// → 返回 0 条
```
:::

### `${}` 的合法用途（只有两个）

```xml
<!-- ① 动态表名（分表场景） -->
<select id="queryById">
    SELECT * FROM ${tableName} WHERE id = #{id}
</select>

<!-- ② 动态排序（ORDER BY 无法参数化） -->
<select id="list">
    SELECT * FROM book
    <if test="sortBy != null">
        ORDER BY ${sortBy} ${sortDir}
    </if>
</select>
```

::: danger 使用 ${} 的强制要求：白名单
```java
private static final Set<String> ALLOWED_SORT =
    Set.of("id", "title", "author", "price", "created_at");
private static final Set<String> ALLOWED_DIR = Set.of("asc", "desc");

public List<Book> list(String sortBy, String sortDir) {
    if (!ALLOWED_SORT.contains(sortBy)) throw new BizException(ResultCode.PARAM_INVALID);
    if (!ALLOWED_DIR.contains(sortDir.toLowerCase())) throw new BizException(ResultCode.PARAM_INVALID);
    return mapper.list(sortBy, sortDir.toLowerCase());
}
```
没有白名单的 `${}` 就是注入漏洞。
:::

::: tip ORDER BY 注入能做什么
```
输入：id; DROP TABLE book; --
输入：id, (SELECT SLEEP(5))
输入：id, (SELECT password FROM users LIMIT 1)
```
虽然不能直接 UNION（位置特殊），但**时间盲注和子查询读取完全可行**。
:::

---

## 四、resultMap 与驼峰映射

### 自动映射的三种模式

```yaml
mybatis:
  configuration:
    auto-mapping-behavior: partial    # none | partial（默认）| full
    map-underscore-to-camel-case: true  # ★ 必开
```

::: key 三种映射模式
| 模式 | 行为 |
|---|---|
| `none` | 不自动映射，全部靠 resultMap |
| `partial`（默认） | 自动映射**没有嵌套结果**的字段；有嵌套（association/collection）的不自动 |
| `full` | 所有情况都自动映射（包括嵌套） |

**`map-underscore-to-camel-case: true` 是最常用的配置**：
`created_at` → `createdAt`，`category_id` → `categoryId`。
:::

### 自动映射的规则

```sql
SELECT id AS bookId, title, created_at FROM book
```
```java
class Book {
    Long bookId;        // ← 匹配 "bookId"（别名一致）
    String title;       // ← 匹配 "title"
    LocalDateTime createdAt;   // ← 驼峰映射 "created_at"
    // 以下字段不匹配 → null
    String author;      // SQL 里没有
    Long categoryId;    // SQL 里没有
}
```

::: warn 自动映射会静默失败
```java
// 期望：book.author = '余华'
// 实际：book.author = null
```
**原因**：SQL 里没查 author 列，或列名/别名与属性名对不上。
**排查**：`resultType` 用错、SQL 少了列、驼峰配置没开、类型不兼容（如 DATETIME → String 不会自动转）。

**这类 bug 不报错，只是数据为 null —— 最难排查。**
:::

### 显式 resultMap

```xml
<resultMap id="bookDetailMap" type="com.bookhub.entity.Book">
    <id property="id" column="id"/>                          <!-- 主键 -->
    <result property="title" column="title"/>                <!-- 普通列 -->
    <result property="createdAt" column="created_at"
            jdbcType="TIMESTAMP"
            typeHandler="org.apache.ibatis.type.LocalDateTimeTypeHandler"/>
    <!-- 不查询的列可以省略 -->
</resultMap>

<select id="findDetail" resultMap="bookDetailMap">
    SELECT id, title, created_at FROM book WHERE id = #{id}
</select>
```

::: tip 什么时候必须用 resultMap
1. 需要**一对一/一对多嵌套映射**（`<association>` / `<collection>`）
2. 字段名和列名**无法通过驼峰转换**匹配（如 `book_title` → `name`）
3. 需要**自定义 typeHandler**（如 JSON 列转对象、枚举转换）
4. 需要**区分主键字段**（影响嵌套查询的缓存与去重）

其余情况用 `resultType` + 驼峰映射就够了。
:::

### typeHandler（枚举与 JSON 列）

```java
// 枚举转换
public enum BookStatus {
    OFF_SHELF(0, "下架"), ON_SHELF(1, "上架");
    private final int code;
    private final String label;
    // ...
    public static BookStatus of(int code) { ... }
}

@MappedTypes(BookStatus.class)
public class BookStatusTypeHandler extends BaseTypeHandler<BookStatus> {
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, BookStatus p, JdbcType t)
            throws SQLException {
        ps.setInt(i, p.getCode());
    }
    @Override
    public BookStatus getNullableResult(ResultSet rs, String col) throws SQLException {
        int code = rs.getInt(col);
        return rs.wasNull() ? null : BookStatus.of(code);
    }
    // 还有两个 getNullableResult 重载
}
```

```yaml
mybatis:
  type-handlers-package: com.bookhub.mybatis.handler
```

---

## 五、动态 SQL

### `<if>`

```xml
<select id="search" resultType="Book">
    SELECT * FROM book WHERE 1=1
    <if test="kw != null and kw != ''">
        AND title LIKE CONCAT('%', #{kw}, '%')
    </if>
    <if test="categoryId != null">
        AND category_id = #{categoryId}
    </if>
    <if test="status != null">
        AND status = #{status}
    </if>
</select>
```

::: warn `WHERE 1=1` 是丑陋但常见的写法
更好的方式用 `<where>`（见下）。`1=1` 的问题：
- 不够优雅
- 如果优化器处理 `1=1` 有额外开销（微乎其微但存在）
- 暴露"你在拼字符串"的信号

不过它**确实能用**，很多老项目都在用。新项目请用 `<where>`。
:::

### `<where>` + `<if>`（推荐）

```xml
<select id="search" resultType="Book">
    SELECT * FROM book
    <where>
        <if test="kw != null and kw != ''">
            AND title LIKE CONCAT('%', #{kw}, '%')
        </if>
        <if test="categoryId != null">
            AND category_id = #{categoryId}
        </if>
    </where>
</select>
```

::: key `<where>` 帮你做了两件事
1. **自动去掉开头的 `AND` / `OR`**（第一个条件不需要写 `AND` 在前面）
2. **如果所有条件都不成立，就不生成 `WHERE` 关键字**

所以上面如果 kw 和 categoryId 都是 null，生成的是 `SELECT * FROM book`（不带 WHERE），完全合法。
:::

### `<set>`（UPDATE 场景）

```xml
<update id="updateSelective">
    UPDATE book
    <set>
        <if test="title != null">title = #{title},</if>
        <if test="author != null">author = #{author},</if>
        <if test="price != null">price = #{price},</if>
        <if test="stock != null">stock = #{stock},</if>
    </set>
    WHERE id = #{id}
</update>
```

::: key `<set>` 帮你做的事
1. **自动去掉最后一个多余的逗号**
2. **如果所有条件都不成立，就不生成 SET**（此时 SQL 会报错，所以要保证至少有一个字段）

`UPDATE book SET WHERE id=1` 是语法错误 —— 但这种情况在业务上说明"没有要更新的字段"，
应该在 Service 层拦住。
:::

### `<foreach>`（IN 查询与批量插入）

```xml
<!-- IN 查询 -->
<select id="findByIds" resultType="Book">
    SELECT * FROM book WHERE id IN
    <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id}
    </foreach>
</select>
<!-- 生成：WHERE id IN (?, ?, ?) -->

<!-- 批量插入 -->
<insert id="batchInsert">
    INSERT INTO book (title, author, category_id, price, total) VALUES
    <foreach collection="list" item="b" separator=",">
        (#{b.title}, #{b.author}, #{b.categoryId}, #{b.price}, #{b.total})
    </foreach>
</insert>
```

::: danger `<foreach>` 的三个坑
```xml
<!-- ✗ 忘了 open/close → 生成 WHERE id IN ?,?,? → 语法错 -->
<foreach collection="ids" item="id" separator=",">#{id}</foreach>

<!-- ✗ collection 名字写错 -->
<!-- 单参数 List 时 collection 必须叫 "list" 或 "collection" -->
int batchInsert(List<Book> books);              <!-- 用 collection="list" -->
int batchInsert(@Param("list") List<Book> books);  <!-- 用 collection="list" 或 "@Param 指定的名" -->

<!-- ✗ IN 查询的集合为空 → WHERE id IN () → 语法错 -->
<if test="ids != null and ids.size() > 0">
    ...
</if>
```
:::

### `<choose>` / `<when>` / `<otherwise>`

```xml
<select id="findByCondition" resultType="Book">
    SELECT * FROM book
    <where>
        <choose>
            <when test="id != null">
                id = #{id}
            </when>
            <when test="isbn != null">
                isbn = #{isbn}
            </when>
            <otherwise>
                status = 1      <!-- 都没传就只查上架的 -->
            </otherwise>
        </choose>
    </where>
</select>
```
相当于 Java 的 `switch-case`，**只执行第一个匹配的分支**。

### `<trim>`（自定义裁剪）

```xml
<!-- 等价于 <where> 的手写版 -->
<trim prefix="WHERE" prefixOverrides="AND |OR ">
    ...
</trim>

<!-- 等价于 <set> 的手写版 -->
<trim prefix="SET" suffixOverrides=",">
    ...
</trim>
```

::: tip 记住 `<where>` 和 `<set>` 的实现
```xml
<where>  ==  <trim prefix="WHERE" prefixOverrides="AND |OR ">
<set>    ==  <trim prefix="SET" suffixOverrides=",">
```
理解这个对应关系，就不会被 `<trim>` 的奇怪属性绕晕。
:::

### `<bind>`（变量绑定）

```xml
<select id="searchByKw" resultType="Book">
    <bind name="pattern" value="'%' + kw + '%'"/>
    SELECT * FROM book WHERE title LIKE #{pattern}
</select>
```
用于把表达式结果绑定成变量（如模糊查询的 `%` 拼接）。

### `<sql>` + `<include>`（SQL 片段复用）

```xml
<sql id="baseColumns">
    id, title, author, price, stock, total, status
</sql>

<sql id="searchWhere">
    <where>
        <if test="kw != null">AND title LIKE CONCAT('%', #{kw}, '%')</if>
        <if test="categoryId != null">AND category_id = #{categoryId}</if>
    </where>
</sql>

<select id="list" resultType="Book">
    SELECT <include refid="baseColumns"/>
    FROM book
    <include refid="searchWhere"/>
    ORDER BY id DESC
</select>

<select id="count" resultType="int">
    SELECT COUNT(*) FROM book
    <include refid="searchWhere"/>
</select>
```

::: key `<sql>` 片段是分页 count 查询的关键
PageHelper 会自动生成 count 查询，但如果你的 SQL 里有复杂 JOIN，
自动 count 可能不准（比如一对多 JOIN 后行数变多）。
这时要**手写 count 查询**，复用同一个 `<sql>` 片段保证条件一致。
:::

---

## 六、一对一与一对多

### 一对一（`<association>`）

场景：借阅记录 → 图书（一条借阅记录对应一本书）

```java
public class BorrowDetail {
    private Long id;
    private Book book;              // 一对一
    private Reader reader;          // 一对一
    private LocalDate borrowDate;
}
```

**方式 1：嵌套结果（一次 JOIN 查询，推荐）**
```xml
<resultMap id="borrowDetailMap" type="BorrowDetail">
    <id property="id" column="b_id"/>
    <result property="borrowDate" column="borrow_date"/>
    <!-- 一对一：用 association -->
    <association property="book" javaType="Book">
        <id property="id" column="book_id"/>
        <result property="title" column="book_title"/>
        <result property="author" column="book_author"/>
    </association>
    <association property="reader" javaType="Reader">
        <id property="id" column="rd_id"/>
        <result property="name" column="reader_name"/>
    </association>
</resultMap>

<select id="findDetail" resultMap="borrowDetailMap">
    SELECT br.id AS b_id, br.borrow_date,
           bk.id AS book_id, bk.title AS book_title, bk.author AS book_author,
           rd.id AS rd_id, rd.name AS reader_name
    FROM borrow br
    JOIN book bk ON br.book_id = bk.id
    JOIN reader rd ON br.reader_id = rd.id
    WHERE br.id = #{id}
</select>
```

**方式 2：嵌套查询（多次查询，N+1 风险）**
```xml
<resultMap id="borrowLazyMap" type="BorrowDetail">
    <id property="id" column="id"/>
    <result property="borrowDate" column="borrow_date"/>
    <association property="book" column="book_id"
                 select="com.bookhub.mapper.BookMapper.findById"/>
</resultMap>

<select id="findDetailLazy" resultMap="borrowLazyMap">
    SELECT * FROM borrow WHERE id = #{id}
</select>
```

::: danger 嵌套查询的 N+1 问题
```xml
<!-- 查 100 条借阅记录 -->
SELECT * FROM borrow LIMIT 100;                     -- 1 次
<!-- 每条记录都要查一次 book → 100 次 -->
```
总共 101 次查询。这就是 **N+1 问题**。

**解法：**
1. **用嵌套结果（JOIN）** —— 一次查询搞定（推荐）
2. **开延迟加载 + 批量加载**：`lazyLoadingEnabled: true` + `aggressiveLazyLoading: false`
3. **`fetchType="lazy"`** 按需加载
:::

### 一对多（`<collection>`）

场景：分类 → 图书（一个分类有多本书）

```java
public class CategoryWithBooks {
    private Long id;
    private String name;
    private List<Book> books;       // 一对多
}
```

```xml
<resultMap id="categoryWithBooksMap" type="CategoryWithBooks">
    <id property="id" column="c_id"/>
    <result property="name" column="c_name"/>
    <!-- 一对多：用 collection -->
    <collection property="books" ofType="Book">
        <id property="id" column="book_id"/>
        <result property="title" column="book_title"/>
        <result property="price" column="book_price"/>
    </collection>
</resultMap>

<select id="findWithBooks" resultMap="categoryWithBooksMap">
    SELECT c.id AS c_id, c.name AS c_name,
           b.id AS book_id, b.title AS book_title, b.price AS book_price
    FROM category c
    LEFT JOIN book b ON b.category_id = c.id
    ORDER BY c.id
</select>
```

::: warn 一对多 JOIN 的两个陷阱
**① 用 INNER JOIN 会丢掉"没有书的分类"**
→ 必须用 `LEFT JOIN`

**② 用这个 SQL 做分页会错**
```sql
SELECT c.*, b.* FROM category c LEFT JOIN book b ON b.category_id = c.id LIMIT 10
```
如果有 4 个分类各 3 本书，`LIMIT 10` 会返回 10 **行**，但只是 4 个分类中的前 3.33 个
→ 分出来的"页"不是"10 个分类"，而是"10 行数据"。

**解法（三选一）：**
1. 先分页查主表 id，再用这些 id 查详情（**两部查询法，推荐**）
2. 用 `<collection select="...">` 嵌套查询（但会 N+1）
3. MyBatis 的 `@MapKey` 或手动在 Service 层分组
:::

### `<id>` 标签的作用

```xml
<resultMap id="x" type="CategoryWithBooks">
    <id property="id" column="c_id"/>      <!-- ★ 必须有 -->
    <collection property="books" ofType="Book">
        <id property="id" column="book_id"/>   <!-- ★ 嵌套里也要有 -->
    </collection>
</resultMap>
```

::: key 为什么 `<id>` 必须写
MyBatis 靠 `<id>` 判断"这两行是不是同一个对象"：
```
c_id | c_name | book_id | book_title
 1   | 计算机  |   1     | CSAPP
 1   | 计算机  |   2     | Java核心技术
```
没有 `<id>`：MyBatis 认为是 2 个 Category，各自带 1 本书 → **错**
有 `<id>`：MyBatis 知道 c_id 相同 → 合并成 1 个 Category，books 里有 2 本 → **对**

**嵌套里的 `<id>` 也必须有**，否则同一个 Book 在不同行会被当成不同对象。
:::

---

## 七、分页实现

### 方式 1：手写 LIMIT（最简单）

```java
List<Book> page(@Param("offset") int offset, @Param("size") int size);
int count();
```
```xml
<select id="page" resultType="Book">
    SELECT * FROM book ORDER BY id DESC LIMIT #{offset}, #{size}
</select>
```

::: warn 手写分页的深分页问题
`LIMIT 100000, 10` 要扫描 100010 行。数据量大时非常慢。
优化：`WHERE id > lastId ORDER BY id LIMIT 10`（游标分页）。
:::

### 方式 2：PageHelper（国内最常用）

```xml
<dependency>
    <groupId>com.github.pagehelper</groupId>
    <artifactId>pagehelper-spring-boot-starter</artifactId>
    <version>2.1.0</version>
</dependency>
```

```java
public PageResult<BookVO> page(BookQueryDTO q) {
    // ★ 只影响紧接着的第一个查询
    PageHelper.startPage(q.getPage(), q.getSize(), q.getSortBy() + " " + q.getSortDir());

    List<Book> list = bookMapper.search(q);   // 这里执行的是分页查询

    PageInfo<Book> info = new PageInfo<>(list);
    return new PageResult<>(convert(list), info.getTotal(), info.getPageNum(),
                            info.getPageSize(), info.getPages());
}
```

::: danger PageHelper 的三个致命坑
**① `startPage` 只对紧接着的第一个查询生效**
```java
PageHelper.startPage(1, 10);
List<Book> books = bookMapper.search(q);      // ✓ 这会被分页
List<Category> cats = categoryMapper.all();   // ✗ 这个不会（ThreadLocal 已消费）
```

**② ThreadLocal 未清理会导致"幽灵分页"**
```java
PageHelper.startPage(1, 10);
// 中间抛异常，没执行到查询 → ThreadLocal 里的分页参数还在
// 同一个线程处理下一个请求 → 那个不相关的查询被莫名分页
```
PageHelper 内部有 finally 清理，但如果你的代码在 startPage 和查询之间抛异常，
且线程被复用，就可能出问题。**所以 startPage 要紧挨着查询。**

**③ 复杂 SQL 的 count 可能算错**
```sql
-- 一对多 JOIN + GROUP BY
SELECT c.*, COUNT(b.id) FROM category c LEFT JOIN book b ...
```
PageHelper 自动生成的 count 会变成 `SELECT COUNT(*) FROM (原 SQL)`，
如果原 SQL 有 GROUP BY，count 结果是"组数"不是"行数"。

**解法：手写 count 查询**
```java
PageHelper.startPage(page, size);
List<X> list = mapper.searchComplex(q);
PageInfo<X> info = new PageInfo<>(list);
info.setTotal(mapper.searchComplexCount(q));   // 手动覆盖
```
:::

### 方式 3：手写 count + 数据查询（最可控）

```java
public PageResult<BookVO> page(BookQueryDTO q) {
    long total = mapper.countByCondition(q);
    if (total == 0) return PageResult.empty();

    List<Book> list = mapper.selectPage(q, q.getOffset(), q.getSize());
    return new PageResult<>(convert(list), total, q.getPage(), q.getSize(),
                            (int) Math.ceil((double) total / q.getSize()));
}
```

::: compare 三种分页方式
| 方式 | 优点 | 缺点 | 适用 |
|---|---|---|---|
| 手写 LIMIT | 无依赖、完全可控 | 要自己 count | 简单项目 |
| PageHelper | 一行搞定 | ThreadLocal 坑、复杂 SQL count 不准 | 常规 CRUD |
| 手写 count + 查询 | 最可控、性能最好 | 代码多 | 复杂查询 |
:::

---

## 八、一级与二级缓存

### 一级缓存（SqlSession 级，默认开启）

::: key 什么是一级缓存
**同一个 `SqlSession` 内，执行完全相同的 SQL（相同参数）→ 第二次直接返回缓存结果，不查库。**

生命周期：`SqlSession` 创建 → 关闭。Spring 集成下，一个事务/一个请求是一个 SqlSession。
:::

```java
try (SqlSession session = factory.openSession()) {
    BookMapper m = session.getMapper(BookMapper.class);

    m.findById(1L);       // 查库，日志显示 SQL
    m.findById(1L);       // 不查库，日志没有 SQL  ← 一级缓存命中
    m.findById(1L);       // 同上
}
```

::: danger 一级缓存失效（清空）的四种情况
```
① 执行了 INSERT / UPDATE / DELETE（哪怕改的是别的表）
② 手动 session.clearCache()
③ 执行了 session.commit() / rollback()
④ 两次查询之间，SqlSession 不同（不同事务/不同请求）
```
第 ④ 条最关键：**跨请求绝对不会有缓存**（因为 SqlSession 是请求级的）。
:::

::: warn 一级缓存的经典坑：数据不一致
```java
// 同一个事务里
Book b1 = mapper.findById(1L);        // 查库，price=100
// （另一个事务把 price 改成 200 并提交）
Book b2 = mapper.findById(1L);        // 缓存命中，还是 100
// b2.getPrice() == 100，但数据库里是 200
```
这在 `REPEATABLE READ` 隔离级别下是"正确"的（一致性快照），
但如果你期望读到最新值，就会困惑。

**解法：**
- 改成 `READ COMMITTED` 隔离级别
- 或用 `SELECT ... FOR UPDATE`（当前读，不用缓存）
- 或者显式 `clearCache()`
:::

### 二级缓存（Mapper/namespace 级，需显式开启）

```xml
<!-- ① 在 Mapper XML 里声明 -->
<cache
    eviction="LRU"          <!-- 回收策略：LRU / FIFO / SOFT / WEAK -->
    flushInterval="60000"   <!-- 60 秒刷新一次 -->
    size="1024"             <!-- 最多缓存 1024 个对象 -->
    readOnly="false"        <!-- false 需要序列化（更安全） -->
/>
```

```yaml
# ② 全局开关
mybatis:
  configuration:
    cache-enabled: true
```

```java
// ③ 实体必须实现 Serializable
public class Book implements Serializable { }
```

::: danger 二级缓存的四个大坑（这就是为什么要谨慎用）
**① 跨 Mapper 的更新不会自动清空缓存**
```java
// BookMapper 的缓存
BookMapper.findById(1L);              // 缓存了
// CategoryMapper 里 UPDATE book ...   // 改了 book 表
BookMapper.findById(1L);              // 缓存命中，返回旧数据！
```
**解法**：在 CategoryMapper 的 `<cache>` 里加 `<cache-ref namespace="BookMapper"/>`。

**② 多表 JOIN 时缓存脏读**
BookMapper 里查了 book + category 的 JOIN，缓存的是组合结果。
Category 表变了 → 缓存不失效 → 脏数据。

**③ 分布式环境下各节点缓存不一致**
节点 A 更新了数据，节点 B 的二级缓存还是旧的。
**解法**：用 Redis 做 MyBatis 的 Cache 实现（`mybatis-redis-cache`），或者干脆关掉二级缓存用 Spring Cache。

**④ 命中率低时纯属浪费**
缓存对象要序列化/反序列化，如果写多读少，开销大于收益。
:::

::: compare 一级 vs 二级
| | 一级缓存 | 二级缓存 |
|---|---|---|
| 级别 | SqlSession | Mapper（namespace） |
| 默认 | ✅ 开启 | ❌ 关闭 |
| 跨 SqlSession | ❌ | ✅ |
| 跨会话/跨请求 | ❌ | ✅ |
| 需要序列化 | ❌ | ✅（readOnly=false 时） |
| 清空时机 | commit/rollback/update | 同 namespace 的写操作 |
| 建议 | 保持默认 | **谨慎，一般关掉** |
:::

::: key 实践建议
**默认关闭二级缓存。**

理由：现代应用几乎都有 Redis，二级缓存的作用被替代；
而它的"跨 Mapper 不失效"问题会带来极难排查的脏数据 bug。

如果要用缓存：
- 单机 + 读多写少 + 数据量小 → 可以考虑
- 分布式 / 数据一致性要求高 → 用 Redis + Spring Cache（可控得多）
:::

---

## 九、常见异常排查

### BindingException: Invalid bound statement (not found)

::: danger 这个异常有且只有五个原因
```
org.apache.ibatis.binding.BindingException:
    Invalid bound statement (not found): com.bookhub.mapper.BookMapper.findById
```

**逐个检查：**

**① namespace 不等于接口全限定名**
```xml
<mapper namespace="com.bookhub.mapper.BookMapper">   <!-- 必须完全一致 -->
```

**② XML 里的 id 不等于方法名**
```xml
<select id="findById">     <!-- 必须和接口方法名一字不差 -->
```

**③ XML 位置没被扫描**
```yaml
mybatis:
  mapper-locations:
    - classpath:mapper/*.xml        # resources/mapper/
    - classpath*:mapper/**/*.xml    # 所有 jar
```
**注意**：Maven 默认只把 `src/main/resources` 下的文件复制到 classpath。
如果你把 XML 放在 `src/main/java` 下，需要在 pom 里配 `<resources>` 包含 `**/*.xml`。

**④ 接口没被扫描**
```java
@Mapper  // 或者启动类加 @MapperScan("com.bookhub.mapper")
```

**⑤ XML 有语法错导致解析失败**
仔细看启动日志，通常会有 SAXParseException 或 DTD 加载失败。
:::

::: lab 10 秒定位法
启动日志里搜 `Mapped Statements collection`（开启 debug 日志）：
```yaml
logging:
  level:
    com.bookhub.mapper: debug
```
启动时会打印"成功加载了多少条 MappedStatement"。
如果数量比你的 XML 里少，说明有 XML 没加载 → 检查路径。
:::

### 其他高频异常

| 异常 | 原因 | 解法 |
|---|---|---|
| `TooManyResultsException` | 期望 1 条却返回多条 | 加 LIMIT 1，或改返回值类型为 List |
| `SQLException: Column 'xxx' not found` | 结果映射的列不存在 | 检查 SQL 是否查了该列，别名是否一致 |
| `TypeException: Could not resolve type alias` | `typeAliasesPackage` 配错 | 检查包路径，或用全限定名 |
| `ReflectionException: There is no setter` | 属性映射不到 setter | 检查 getter/setter、字段名拼写 |
| `PersistenceException: Error updating database` | SQL 执行失败 | 看 `Cause:` 里的真实 SQL 错误 |
| `IllegalArgumentException: Mapped Statements collection does not contain value for` | 同 BindingException | 同上 |
| `ExecutorException: Error getting generated key` | 主键回填失败 | 检查 `useGeneratedKeys` + `keyProperty` |

::: warn 看异常要找 Cause
```java
// MyBatis 把真实错误包在 cause 里
org.apache.ibatis.exceptions.PersistenceException:
### Error updating database. Cause: java.sql.SQLIntegrityConstraintViolationException:
### Duplicate entry 'R001' for key 'uk_reader_card'
```
最后一行才是真正的原因（唯一键冲突）。**排查一定要往下看。**
:::

---

## 十、本节速查

```xml
<!-- 基础 -->
<mapper namespace="全限定接口名">
  <select id="方法名" resultType="实体类">SQL</select>
  <insert id="x" useGeneratedKeys="true" keyProperty="id">...</insert>
  <update id="x">...</update>
  <delete id="x">...</delete>
</mapper>

<!-- 参数 -->
单个参数：#{任意名}
多参数：@Param("name") → #{name}
对象：#{属性名}
集合：<foreach collection="list" item="x">

<!-- #{} vs ${} -->
#{}：预编译，防注入（用于所有值）
${}：拼接，可注入（仅用于表名/列名，必须白名单）

<!-- 动态 SQL -->
<where> 自动去前导 AND/OR
<set>   自动去尾逗号
<foreach> IN 查询、批量插入
<choose> switch-case
<trim>   where/set 的手写版
<sql>+<include> 片段复用

<!-- 关联 -->
<association> 一对一
<collection>  一对多
必须有 <id>，否则对象不合并
优先用嵌套结果（JOIN），少用嵌套查询（N+1）

<!-- 分页 -->
手写 LIMIT / PageHelper.startPage（紧挨查询）/ 手写 count

<!-- 缓存 -->
一级：SqlSession 级，默认开，update/commit 清空
二级：Mapper 级，默认关，需 <cache/> + Serializable
      跨 Mapper 不失效 → 建议关掉用 Redis
```

::: interview 面试高频
**Q：`#{}` 和 `${}` 的区别？**
A：`#{}` 是 PreparedStatement 占位符，预编译，参数不进 SQL 语法层 → 免疫注入；
`${}` 是字符串直接拼接 → 可注入。`${}` 只用于表名/列名/ORDER BY 等无法参数化的位置，
且必须白名单校验。

**Q：MyBatis 一级缓存和二级缓存的区别？**
A：一级是 SqlSession 级，默认开启，commit/rollback/update 时清空；
二级是 Mapper（namespace）级，需 `<cache/>` 开启且实体实现 Serializable，可跨 SqlSession。
二级缓存有"跨 Mapper 更新不失效"的坑，分布式下多节点不一致，建议用 Redis 替代。

**Q：resultType 和 resultMap 的区别？**
A：resultType 靠自动映射（列名/别名 → 属性名，可开驼峰）；
resultMap 显式定义映射，支持一对一/一对多嵌套、自定义 typeHandler，
适合字段名不匹配或有关联对象的场景。

**Q：一对一和一对多怎么配？**
A：一对一用 `<association property="x" javaType="Y">`，
一对多用 `<collection property="list" ofType="Y">`。
必须有 `<id>` 标签（否则对象不合并）。
优先用嵌套结果（一条 JOIN SQL），避免嵌套查询导致的 N+1。

**Q：N+1 问题是什么？怎么解决？**
A：查 N 条主记录后，每条都要再查一次关联数据 → 1 + N 次查询。
解法：用 JOIN 一次性查（嵌套结果映射）、开延迟加载批量加载、或者两步查询法。

**Q：PageHelper 的原理和坑？**
A：基于 MyBatis 拦截器 + ThreadLocal，`startPage` 把分页参数放进 ThreadLocal，
拦截下一条 SQL 自动加 LIMIT 并生成 count 查询。
坑：只对紧接着的第一个查询生效；ThreadLocal 未清理会导致幽灵分页；
复杂 JOIN/GROUP BY 的自动 count 可能不准，需手写 count。

**Q：Invalid bound statement (not found) 怎么排查？**
A：五个方向：namespace 不对、id 与方法名不一致、XML 没被 mapper-locations 扫描到、
接口没被 @Mapper/@MapperScan 扫描、XML 语法错导致解析失败。
:::

---

## 延伸练习

1. 把本工坊 `labs/jdbc` 里的 `BookDao` 改写成 MyBatis Mapper，对比代码量。
2. 故意把 XML 里的 `namespace` 改成错的，观察启动是否报错、运行时异常信息。
3. 写一个动态 SQL：支持按关键词、分类、库存状态、价格区间任意组合查询。
4. 用一对多查询"每个分类及其图书"，对比 JOIN + `<collection>` 和两步查询的结果、SQL 次数。
5. 开二级缓存，然后跨 Mapper 更新数据，验证脏读，再关掉缓存对比。
6. 用 PageHelper 分页一个 JOIN + GROUP BY 的查询，观察 count 是否准确，不准确就手写 count。
7. 用 `${}` 实现动态排序，然后不加白名单，输入 `price, (SELECT SLEEP(3))` 观察延时（注入演示）。

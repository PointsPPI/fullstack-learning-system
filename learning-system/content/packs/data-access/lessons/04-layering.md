# 分层解耦

::: key 一句话抓住本质
分层的唯一目的是**隔离变化**：需求变了，只改一层，其他层不动。
判断分层是否合格的标准只有一条：**"改一个功能，你要动几个文件？"** 越少越好。
:::

## 学习点

| # | 知识点 | 优先级 |
|---|---|---|
| 1 | 三层职责边界 | ★★★★★ |
| 2 | DTO / VO / Entity 转换 | ★★★★★ |
| 3 | 接口与实现分离 | ★★★★ |
| 4 | 依赖倒置与面向接口 | ★★★★★ |
| 5 | AOP 处理横向关注点 | ★★★★ |
| 6 | 越层反例与重构 | ★★★★★ |
| 7 | 包结构规范 | ★★★ |

---

## 一、三层职责边界

```
HTTP 请求
   ↓
┌──────────────────────────────┐
│ Controller（控制层）          │  ← HTTP 世界的翻译官
│  · 接收参数、校验格式          │
│  · 调用 Service              │
│  · 包装响应、决定状态码        │
│  · 不做业务判断！             │
└──────────────┬───────────────┘
               ↓ DTO
┌──────────────────────────────┐
│ Service（业务层）             │  ← 业务规则的唯一所在地
│  · 业务规则（能不能借、借多久）│
│  · 事务边界                   │
│  · 多个 Mapper 的编排         │
│  · 数据转换 Entity ↔ VO       │
│  · 不做 SQL、不碰 HttpServletRequest │
└──────────────┬───────────────┘
               ↓ Entity
┌──────────────────────────────┐
│ Mapper（持久层）              │  ← 只跟数据库打交道
│  · SQL 语句                   │
│  · 结果集映射                 │
│  · 不做业务判断！             │
└──────────────┬───────────────┘
               ↓
            MySQL
```

### 职责对照表

| 关注点 | Controller | Service | Mapper |
|---|---|---|---|
| 接收 HTTP 参数 | ✅ | ❌ | ❌ |
| 参数格式校验（非空、长度） | ✅ | ⚠️ 业务级校验 | ❌ |
| 业务规则（库存够不够） | ❌ | ✅ | ❌ |
| 事务控制 | ❌ | ✅ | ❌ |
| SQL 编写 | ❌ | ❌ | ✅ |
| 结果集映射 | ❌ | ❌ | ✅ |
| DTO → Entity 转换 | ❌ | ✅ | ❌ |
| Entity → VO 转换 | ❌ | ✅ | ❌ |
| 响应包装 | ✅ | ❌ | ❌ |
| 异常转 HTTP 状态码 | ✅（全局处理器） | ❌ | ❌ |

::: danger 三个越层的典型反例
**① Controller 里写业务判断**
```java
// ✗ 库存判断跑到 Controller
@PostMapping("/{id}/borrow")
public R<?> borrow(@PathVariable Long id, @RequestBody BorrowDTO dto) {
    Book book = bookMapper.findById(id);            // ← Controller 直接调 Mapper（越层）
    if (book.getStock() <= 0) return R.fail("库存不足");  // ← 业务规则在 Controller
    bookMapper.decreaseStock(id);
    borrowMapper.insert(...);
    return R.ok();
}
```
问题：这个规则被 App、小程序、定时任务复用时会**各写一遍**，改规则要改 N 处。

**② Service 里拿 HttpServletRequest**
```java
// ✗ Service 依赖 Web 层
@Service
public class BookService {
    public void save(HttpServletRequest req) {     // ← Service 被 Web 污染
        String ip = req.getRemoteAddr();
    }
}
```
问题：定时任务、消息消费者调用这个方法时，构造不出 HttpServletRequest。
Service 必须能脱离 Web 容器运行。

**③ Mapper 里写业务逻辑**
```xml
<!-- ✗ 业务规则写进 SQL -->
<update id="borrow">
    UPDATE book SET stock = stock - 1
    WHERE id = #{id} AND stock > 0
      AND (SELECT COUNT(*) FROM borrow WHERE reader_id=#{rid} AND status=0) &lt; 5
</update>
```
问题：规则藏在 SQL 里，代码里看不到，改规则要改 XML 还要重新理解业务。
（**注意**：`WHERE stock > 0` 这种**并发安全的条件**必须放 SQL 里，这是例外 —— 见下文）
:::

### 一条边界：并发安全的条件必须在 SQL 里

```java
// Service 层
public void borrow(Long bookId, Long readerId) {
    // ① 业务校验（普通查询，可能有并发窗口）
    Book book = bookMapper.findById(bookId)
        .orElseThrow(() -> new BizException(BOOK_NOT_FOUND));
    if (book.getStatus() != 1) throw new BizException(BOOK_OFF_SHELF);

    // ② 原子扣减（条件写在 SQL，靠数据库行锁保证）
    int rows = bookMapper.decreaseStock(bookId);
    if (rows == 0) throw new BizException(BOOK_STOCK_EMPTY);   // ← 关键

    // ③ 记录借阅
    borrowMapper.insert(...);
}
```

```xml
<update id="decreaseStock">
    UPDATE book SET stock = stock - 1 WHERE id = #{id} AND stock &gt; 0
</update>
```

::: key 为什么"库存 > 0"要写在 SQL 里
```java
// ✗ "先查再改"在并发下超卖
if (book.getStock() > 0) {          // 两个线程都读到 stock=1
    bookMapper.decreaseStock(bookId);  // 都执行 → stock 变成 -1
}
```

```sql
-- ✓ 条件更新：让数据库的行锁替你做判断
UPDATE book SET stock = stock - 1 WHERE id = ? AND stock > 0;
-- 影响行数 0 → 说明没扣成功 → 抛异常
```

**判断标准**：
- 规则需要**读多个数据、做复杂判断** → Service
- 规则是**"某个值满足条件才允许更新"** → 必须下推到 SQL（原子性 + 并发安全）
:::

---

## 二、DTO / VO / Entity 转换

### 三者定义

| 类型 | 全称 | 职责 | 出现的层 |
|---|---|---|---|
| **Entity** | 实体 | 与数据库表一一对应 | Mapper ↔ Service |
| **DTO** | Data Transfer Object | 接收请求参数（带校验） | Controller → Service |
| **VO** | View Object | 返回给前端的视图 | Service → Controller |

```
前端 ──DTO──→ Controller ──Entity──→ Service ──Entity──→ Mapper ──→ DB
前端 ←──VO─── Controller ←──VO───── Service ←──Entity── Mapper ←── DB
```

### 为什么不能一个类走到底

::: danger 用 Entity 直接接收/返回的五个问题
```java
// ✗ 用 Entity 接收请求
@PostMapping
public Book create(@RequestBody Book book) { }
```

**① 暴露内部字段**
```java
public class Reader {
    private String password;        // 前端能直接传密码进来
    private Integer status;         // 前端能把自己设成"管理员"
    private LocalDateTime createdAt;  // 前端能伪造创建时间
}
```

**② 表结构变化击穿 API**
```sql
ALTER TABLE book ADD COLUMN internal_cost DECIMAL(10,2);   -- 新增内部字段
```
`SELECT *` 直接返回给前端 → 内部成本价泄露。

**③ 无法做聚合/计算字段**
前端要显示 `categoryName`、`available`、`overdueDays`，Entity 里都没有。

**④ 校验规则无法区分新增/修改**
新增时 `id` 必须为空，修改时 `id` 必须存在 —— 同一个 Entity 无法表达。

**⑤ 敏感字段无法脱敏**
手机号要显示成 `138****0001`，Entity 里存的是完整的。
:::

### 完整的三层数据流

```java
// ══════════ DTO（接收） ══════════
public record BookCreateDTO(
    @NotBlank @Size(max = 200) String title,
    @NotBlank @Size(max = 100) String author,
    @NotNull Long categoryId,
    @NotNull @DecimalMin("0.00") BigDecimal price,
    @NotNull @Min(0) Integer total
) {}

// ══════════ Entity（数据库） ══════════
public class Book {
    private Long id;
    private String title;
    private String author;
    private Long categoryId;
    private BigDecimal price;
    private Integer stock;
    private Integer total;
    private Integer status;
    private LocalDateTime createdAt;
}

// ══════════ VO（返回） ══════════
public record BookVO(
    Long id, String title, String author,
    Long categoryId, String categoryName,        // 联表来的
    BigDecimal price, Integer stock, Integer total,
    String statusText,                            // 枚举翻译
    boolean available                             // 计算
) {}
```

```java
// ══════════ Service：转换的唯一地方 ══════════
@Service
public class BookServiceImpl implements BookService {

    public Long create(BookCreateDTO dto) {
        Book book = new Book();
        book.setTitle(dto.title());
        book.setAuthor(dto.author());
        book.setCategoryId(dto.categoryId());
        book.setPrice(dto.price());
        book.setTotal(dto.total());
        book.setStock(dto.total());      // 业务规则：初始库存 = 总藏书量
        book.setStatus(1);
        bookMapper.insert(book);
        return book.getId();
    }

    public List<BookVO> list(BookQueryDTO q) {
        List<Book> books = bookMapper.search(q);
        Map<Long, String> catNames = categoryMapper.nameMap();     // 批量查分类名
        return books.stream().map(b -> toVO(b, catNames)).toList();
    }

    private BookVO toVO(Book b, Map<Long, String> catNames) {
        return new BookVO(
            b.getId(), b.getTitle(), b.getAuthor(),
            b.getCategoryId(), catNames.get(b.getCategoryId()),
            b.getPrice(), b.getStock(), b.getTotal(),
            b.getStatus() == 1 ? "上架" : "下架",
            b.getStock() > 0 && b.getStatus() == 1
        );
    }
}
```

::: key 转换方法的三种组织方式
**① 私有方法（最简单，上面就是）**
```java
private BookVO toVO(Book b) { ... }
```

**② 静态工厂（VO 自己会转）**
```java
public record BookVO(...) {
    public static BookVO of(Book b, String catName) { ... }
}
```

**③ MapStruct / BeanUtils（批量字段映射）**
```java
@Mapper
public interface BookConverter {
    BookVO toVO(Book book);
    Book toEntity(BookCreateDTO dto);
}
```
MapStruct 在编译期生成实现，性能等同手写，适合字段多的场景。

**⚠️ 不要用 `BeanUtils.copyProperties`** —— 反射慢、字段名不一致时静默失败、容易复制不该复制的字段。
:::

### 转换的边界在哪里

::: warning 转换该放 Service，不是 Controller
```java
// ✗ Controller 里转换 → Controller 变胖，且其他入口（定时任务）无法复用
@GetMapping
public R<List<BookVO>> list(BookQueryDTO q) {
    List<Book> list = bookMapper.search(q);         // 越层
    return R.ok(list.stream().map(this::toVO).toList());
}

// ✓ Service 返回 VO，Controller 只包装响应
@GetMapping
public R<List<BookVO>> list(@Valid BookQueryDTO q) {
    return R.ok(bookService.list(q));
}
```

**例外**：DTO → Service 的入参传递由 Controller 完成（因为 Controller 接收的就是 DTO），
但 DTO → Entity 的转换应该在 Service（因为"初始库存 = 总藏书量"是业务规则）。
:::

---

## 三、接口与实现分离

### 为什么要写 interface

```java
// 接口
public interface BookService {
    BookDetailVO detail(Long id);
    Long create(BookCreateDTO dto);
    void update(Long id, BookUpdateDTO dto);
    void delete(Long id);
}

// 实现
@Service
public class BookServiceImpl implements BookService {
    // ...
}
```

::: compare 写接口的真实收益 vs 常见误解
| 理由 | 真实性 |
|---|---|
| "方便将来换实现" | ⚠️ 大部分项目永远只有一个实现 —— **这个理由站不住脚** |
| "方便单元测试 Mock" | ✅ 真实（Mock 接口比 Mock 类容易） |
| "支持多实现（不同策略）" | ✅ 真实（如 DbService / CacheService 用 `@Primary` 选） |
| "AOP 代理更稳定" | ✅ 真实（JDK 动态代理必须基于接口） |
| "约束调用边界" | ✅ 真实（接口只暴露该暴露的方法） |
| "团队并行开发" | ✅ 真实（一个写接口，一个写实现） |
:::

::: key 什么时候该写接口，什么时候不该
**该写：**
- 有多个实现（策略模式：支付方式、存储后端）
- 需要跨模块/跨团队协作（先定契约）
- 需要 Mock 测试的复杂依赖

**不该写：**
- 单纯的 CRUD，永远只有一个实现 → 接口只是噪音
- 内部工具类

**折中方案（本工坊采用）**：
Controller 依赖 `BookService` 接口，Service 内部依赖 `BookMapper` 接口（MyBatis 生成的代理）。
这样既保留了"接口隔离"的可测试性，又不会每个类都强行加一层空接口。
:::

### 多实现的组织

```java
public interface Notifier {
    void send(Long readerId, String msg);
}

@Service("smsNotifier")
public class SmsNotifier implements Notifier { ... }

@Service("emailNotifier")
public class EmailNotifier implements Notifier { ... }

// 组合实现：策略模式
@Service
@Primary                        // 默认注入这个
public class CompositeNotifier implements Notifier {
    private final List<Notifier> all;      // ★ Spring 会注入所有实现
    public CompositeNotifier(List<Notifier> all) { this.all = all; }

    @Override
    public void send(Long rid, String msg) {
        all.forEach(n -> {
            try { n.send(rid, msg); }
            catch (Exception e) { log.warn("通知失败", e); }   // 单个失败不影响其他
        });
    }
}
```

::: tip `List<Notifier>` 会自动注入所有实现
这是 Spring 的一个很有用的特性。常用来做：
- 策略收集（所有支付方式）
- 责任链（所有校验器依次执行）
- 插件机制（所有 Handler）

顺序可以用 `@Order` 控制。
:::

---

## 四、依赖倒置与面向接口

### 依赖倒置原则（DIP）

::: key 两条规则
1. **高层模块不应依赖低层模块，两者都应依赖抽象**
2. **抽象不应依赖细节，细节应依赖抽象**
:::

```java
// ✗ 违反 DIP：Service（高层）直接依赖 MyBatis 的具体类
@Service
public class BookServiceImpl {
    private final SqlSessionTemplate sqlSession;   // ← 直接依赖 MyBatis 实现
}

// ✓ 依赖抽象：Service 只依赖自己定义的接口
@Service
public class BookServiceImpl implements BookService {
    private final BookRepository repo;    // ← 依赖自己领域的抽象
}

// Repository 接口（在 Service 层定义）
public interface BookRepository {
    Optional<Book> findById(Long id);
    void save(Book book);
}

// 实现（在基础设施层，依赖 MyBatis）
@Repository
public class MyBatisBookRepository implements BookRepository {
    private final BookMapper mapper;    // ← 细节依赖抽象
}
```

::: warn 这是"六边形架构/洋葱架构"的核心
```
         ┌─────────────────┐
         │   Controller    │
         └────────┬────────┘
                  ↓
    ┌─────────────────────────┐
    │      Service（核心）     │  ← 只依赖自己定义的接口
    │  BookService            │
    │  BookRepository（接口）  │
    └───────────┬─────────────┘
                ↓ 实现
    ┌─────────────────────────┐
    │  MyBatis / JPA / 内存    │  ← 可替换的"插件"
    └─────────────────────────┘
```

**好处**：换 ORM（MyBatis → JPA）只改 Repository 实现，Service 一行不动。
写测试时用内存实现（`InMemoryBookRepository`）就不需要数据库。

**注意**：这是"理想状态"。小项目直接用 Mapper 也完全可接受 ——
关键是**知道自己在做什么取舍**，而不是盲目套架构。
:::

### 循环依赖 = 分层设计有问题的信号

```java
// ✗ UserService 依赖 OrderService，OrderService 依赖 UserService
@Service public class UserService { 
    public UserService(OrderService os) { } 
}
@Service public class OrderService { 
    public OrderService(UserService us) { }   // 启动报错
}
```

**修复思路（按优先级）**：
1. **抽出第三方类**：把两者的共同依赖抽到 `UserOrderFacade`，两边都依赖它
2. **事件解耦**：`OrderService` 发布事件，`UserService` 监听
3. **单向依赖**：让 `UserService` 不依赖 `OrderService`，把需要的数据通过参数传入

::: danger @Lazy 是止痛药，不是解药
```java
@Autowired @Lazy private OrderService os;   // 能启动，但设计问题还在
```
它只是把"启动时报错"变成"运行时的隐式循环"。
:::

---

## 五、AOP 处理横向关注点

### 什么是横向关注点

::: key 纵向 vs 横向
```
纵向（业务主线）       横向（每个方法都需要）
─────────────────     ─────────────────────
borrow()  借书          日志
return()  还书          性能监控
renew()   续借          权限校验
delete()  删除          事务
                       缓存
```
如果每个方法里都写 `log.info(...)` + `checkPermission(...)` + 计时，
业务代码就被淹没了。
:::

### 用 AOP 抽出来

```java
@Aspect
@Component
@Order(1)
public class ServiceLogAspect {

    private static final Logger log = LoggerFactory.getLogger(ServiceLogAspect.class);

    @Around("execution(public * com.bookhub.service..*.*(..))")
    public Object logAndTime(ProceedingJoinPoint pjp) throws Throwable {
        String method = pjp.getSignature().toShortString();
        Object[] args = pjp.getArgs();
        long t0 = System.nanoTime();

        try {
            Object ret = pjp.proceed();
            long ms = (System.nanoTime() - t0) / 1_000_000;
            log.info("✓ {} 耗时{}ms 参数={}", method, ms, abbreviate(args));
            if (ms > 500) log.warn("慢方法 {} {}ms", method, ms);
            return ret;
        } catch (Throwable e) {
            log.error("✗ {} 异常 {}", method, e.getMessage());
            throw e;                    // ★ 必须重新抛出，否则事务不会回滚
        }
    }
}
```

::: danger AOP 里 catch 了异常却不抛 = 事务失效
```java
// ✗
try { return pjp.proceed(); }
catch (Exception e) { log.error("失败", e); return null; }   // 异常被吞 → 不回滚

// ✓
try { return pjp.proceed(); }
catch (Exception e) { log.error("失败", e); throw e; }
```
:::

### 五个切面示例

```java
// ① 权限校验
@Around("@annotation(com.bookhub.aspect.RequireRole)")
public Object checkRole(ProceedingJoinPoint pjp) throws Throwable {
    RequireRole ann = ((MethodSignature) pjp.getSignature())
        .getMethod().getAnnotation(RequireRole.class);
    String need = ann.value();
    if (!UserContext.hasRole(need)) throw new BizException(ResultCode.FORBIDDEN);
    return pjp.proceed();
}

// ② 幂等（防重复提交）
@Around("@annotation(com.bookhub.aspect.Idempotent)")
public Object idempotent(ProceedingJoinPoint pjp) throws Throwable {
    String key = buildKey(pjp);
    if (!redis.setIfAbsent(key, "1", Duration.ofSeconds(10))) {
        throw new BizException(ResultCode.DUPLICATE_SUBMIT);
    }
    return pjp.proceed();
}

// ③ 缓存
@Around("@annotation(com.bookhub.aspect.Cached)")
public Object cached(ProceedingJoinPoint pjp) throws Throwable {
    String key = buildKey(pjp);
    Object v = redis.get(key);
    if (v != null) return v;
    Object r = pjp.proceed();
    redis.set(key, r, Duration.ofMinutes(10));
    return r;
}

// ④ 限流
@Around("@annotation(com.bookhub.aspect.RateLimit)")
public Object rateLimit(ProceedingJoinPoint pjp) throws Throwable {
    if (!limiter.tryAcquire()) throw new BizException(ResultCode.TOO_MANY_REQUESTS);
    return pjp.proceed();
}

// ⑤ 重试
@Around("@annotation(com.bookhub.aspect.Retry)")
public Object retry(ProceedingJoinPoint pjp) throws Throwable {
    int max = 3;
    for (int i = 0; i < max; i++) {
        try { return pjp.proceed(); }
        catch (Exception e) {
            if (i == max - 1) throw e;
            Thread.sleep(200L * (i + 1));
        }
    }
    return null;
}
```

::: tip `@annotation` 切点最实用
```java
@Around("@annotation(com.bookhub.aspect.Cached)")     // 只切标了该注解的方法
```
比 `execution(* com.bookhub.service..*.*(..))` 精确得多，且**意图明确** ——
看代码就知道这个方法有缓存，不用去切面里找。
:::

### AOP 的自调用陷阱

::: danger 同一个类内调用，AOP 全部失效
```java
@Service
public class BookServiceImpl {
    public void outer() {
        this.inner();           // ✗ 走原始对象，不经过代理
    }

    @Cached                     // 期望这里走缓存切面
    public void inner() { ... }
}
```

**三种修复：**
```java
// ① 注入自己（Spring 4.3+ 会自动处理循环依赖）
@Autowired @Lazy private BookServiceImpl self;
public void outer() { self.inner(); }

// ② 用 AopContext（需开启 exposeProxy）
@EnableAspectJAutoProxy(exposeProxy = true)
((BookServiceImpl) AopContext.currentProxy()).inner();

// ③ 拆到另一个类（最干净）
@Service public class BookInnerService { @Cached public void inner() { } }
```
:::

---

## 六、越层反例与重构

### 一个"能跑但烂"的 Controller

```java
// ══════════ ✗ 典型新手代码（200 行） ══════════
@RestController
public class BookController {

    @Autowired private DataSource dataSource;      // 越层：直接拿数据源
    @Autowired private SqlSessionFactory sqlSessionFactory;

    @PostMapping("/api/books")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        Map<String, Object> result = new HashMap<>();
        try {
            // ① 手动校验（散落）
            String title = (String) body.get("title");
            if (title == null || title.trim().isEmpty()) {
                result.put("code", 400); result.put("msg", "书名不能为空");
                return result;
            }
            if (title.length() > 200) {
                result.put("code", 400); result.put("msg", "书名太长");
                return result;
            }
            // ② 手动 JDBC
            try (Connection conn = dataSource.getConnection()) {
                conn.setAutoCommit(false);
                // ③ SQL 写在 Controller
                try (PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO book (title, author, price) VALUES (?,?,?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, title);
                    ps.setString(2, (String) body.get("author"));
                    ps.setBigDecimal(3, new BigDecimal(body.get("price").toString()));
                    ps.executeUpdate();
                    ResultSet keys = ps.getGeneratedKeys();
                    keys.next();
                    result.put("id", keys.getLong(1));
                }
                // ④ 业务规则也在这
                if (body.get("categoryId") == null) {
                    conn.rollback();          // 手动事务管理
                    result.put("code", 400); result.put("msg", "分类必填");
                    return result;
                }
                conn.commit();
            }
            result.put("code", 0); result.put("msg", "ok");
        } catch (Exception e) {
            result.put("code", 500); result.put("msg", e.getMessage());   // 泄露异常信息
        }
        return result;                          // 返回值结构不统一
    }
}
```

::: danger 这段代码的九个问题
1. **越两层**：Controller 直接用 JDBC，跳过了 Service 和 Mapper
2. **事务手管**：`setAutoCommit(false)` + 手动 rollback，容易漏
3. **校验散落**：硬编码判断，无法复用
4. **SQL 在 Controller**：改表结构要在所有 Controller 里搜
5. **异常信息外泄**：`e.getMessage()` 可能含表名/内联 IP
6. **响应结构不统一**：`Map` 手拼，字段名靠约定
7. **业务规则埋在流程里**：分类必填这个规则藏在第 60 行
8. **无法测试**：要起 Web 容器 + 真数据库
9. **无法复用**：定时任务导数据时，这段逻辑完全用不了
:::

### 重构后的样子

```
controller/BookController.java      ← 20 行
service/BookService.java            ← 接口
service/impl/BookServiceImpl.java   ← 60 行（业务规则 + 事务）
mapper/BookMapper.java + .xml       ← SQL
dto/BookCreateDTO.java              ← 校验注解
vo/BookVO.java                      ← 返回结构
common/R.java + GlobalExceptionHandler  ← 统一响应与异常
```

```java
// ══════════ Controller（20 行） ══════════
@RestController
@RequestMapping("/api/books")
public class BookController {
    private final BookService service;
    public BookController(BookService s) { this.service = s; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public R<Long> create(@Valid @RequestBody BookCreateDTO dto) {
        return R.ok(service.create(dto));
    }

    @GetMapping
    public R<PageResult<BookVO>> list(@Valid BookQueryDTO q) {
        return R.ok(service.page(q));
    }
}
```

```java
// ══════════ Service（业务规则 + 事务） ══════════
@Service
public class BookServiceImpl implements BookService {
    private final BookMapper bookMapper;
    private final CategoryMapper categoryMapper;

    public BookServiceImpl(BookMapper bm, CategoryMapper cm) {
        this.bookMapper = bm;
        this.categoryMapper = cm;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long create(BookCreateDTO dto) {
        // 业务规则集中在这里
        if (categoryMapper.findById(dto.categoryId()) == null) {
            throw new BizException(ResultCode.CATEGORY_NOT_FOUND);
        }
        if (dto.isbn() != null && bookMapper.existsByIsbn(dto.isbn())) {
            throw new BizException(ResultCode.BOOK_ISBN_DUPLICATE);
        }

        Book book = new Book();
        book.setTitle(dto.title());
        book.setAuthor(dto.author());
        book.setIsbn(dto.isbn());
        book.setCategoryId(dto.categoryId());
        book.setPrice(dto.price());
        book.setTotal(dto.total());
        book.setStock(dto.total());
        book.setStatus(1);

        bookMapper.insert(book);
        return book.getId();
    }
}
```

::: key 重构带来的六个收益（"改一个功能动几个文件"）
| 场景 | 重构前 | 重构后 |
|---|---|---|
| 加一个"出版社必填"规则 | 改 Controller（200 行里找） | 改 DTO + Service 各一行 |
| 改库存初始值规则 | 改 Controller | 改 Service |
| 换 ORM | 全部重写 | 改 Mapper |
| 加日志 | 每个方法里手写 | 加一个切面 |
| 加定时任务复用 | 不可能 | 调 `service.create()` |
| 写单元测试 | 要起容器 + 数据库 | Mock 两个 Mapper |
:::

---

## 七、包结构规范

### 按层分包（最常见）

```
com.bookhub
├── BookHubApplication.java
├── common/                     通用能力
│   ├── R.java
│   ├── ResultCode.java
│   ├── BizException.java
│   └── GlobalExceptionHandler.java
├── config/                     配置类
│   ├── WebConfig.java
│   ├── MybatisConfig.java
│   └── CorsConfig.java
├── controller/                 控制层
│   └── BookController.java
├── service/                    业务层（接口）
│   ├── BookService.java
│   └── impl/
│       └── BookServiceImpl.java
├── mapper/                     持久层
│   └── BookMapper.java
├── entity/                     数据库实体
│   └── Book.java
├── dto/                        入参
│   └── BookCreateDTO.java
├── vo/                         出参
│   └── BookVO.java
├── aspect/                     切面
│   └── ServiceLogAspect.java
└── util/                       工具
```

### 按功能分包（按业务域）

```
com.bookhub
├── book/                       图书域（自带全部层次）
│   ├── BookController.java
│   ├── BookService.java
│   ├── BookServiceImpl.java
│   ├── BookMapper.java
│   ├── Book.java
│   └── dto/ vo/
├── reader/                     读者域
├── borrow/                     借阅域
└── common/
```

::: compare 两种分包方式
| | 按层分包 | 按功能分包 |
|---|---|---|
| 找"图书相关的一切" | ❌ 要跨 6 个包 | ✅ 在 1 个包 |
| 找"所有 Controller" | ✅ 在 1 个包 | ❌ 要跨 N 个包 |
| 微服务拆分 | ❌ 要把层包打散重组 | ✅ 直接搬一个包 |
| 适合 | 小型单体 | 中大型单体 / 微服务 |
| 团队并行 | ❌ 多人同时改 controller 包冲突 | ✅ 各管各的域 |

**本工坊用"按层分包"** —— 因为它是教学项目，主题清晰比业务域清晰更重要。
真实项目（>5 人的团队）建议按功能分包。
:::

::: warn 包的依赖方向必须是单向的
```
controller → service → mapper → (entity)
     ↓          ↓
    dto/vo   entity
```

**严禁反向依赖：**
```java
// ✗ Mapper 依赖 Service
@Mapper public interface BookMapper {
    @Autowired BookService service;   // 反了！
}

// ✗ Service 依赖 Controller
@Service public class BookService {
    @Autowired BookController ctrl;   // 反了！
}
```
可以用 `ArchUnit` 或 `Spring Modulith` 自动检查包依赖。
:::

---

## 八、本节速查

```
// 职责
Controller：HTTP 参数、校验格式、响应包装、状态码
Service：业务规则、事务、多 Mapper 编排、DTO/Entity/VO 转换
Mapper：SQL、结果映射

// 禁止
Controller 调 Mapper（越层）
Service 拿 HttpServletRequest（Web 污染）
Service 写 SQL（职责错位）
Mapper 写业务规则（规则不可见）—— 但并发安全条件必须下推 SQL

// 数据对象
Entity = 表结构（不直接收/返）
DTO = 入参（带校验注解）
VO = 出参（可聚合、脱敏、计算）
转换放 Service，不放 Controller

// 接口
多实现/跨团队/需 Mock → 写接口
单纯 CRUD → 可以不写（避免空接口噪音）

// 依赖倒置
Service 依赖自己定义的 Repository 接口，实现（MyBatis/JPA）放外层

// AOP
@Around + @annotation 最实用
catch 必须重新 throw（否则事务不回滚）
自调用不走代理 → 注入 self / AopContext / 拆类

// 包结构
按层（教学/小项目）vs 按功能域（中大型）
依赖方向单向：controller → service → mapper
```

::: interview 面试高频
**Q：Controller、Service、Mapper 的职责怎么划分？**
A：Controller 只做 HTTP 层的事（参数接收、格式校验、响应包装、状态码）；
Service 承载全部业务规则、事务边界、多 Mapper 编排、数据对象转换；
Mapper 只做 SQL 与结果映射。判断标准：业务规则必须能在非 Web 场景（定时任务、MQ 消费者）复用。

**Q：为什么要用 DTO / VO，不能直接用 Entity？**
A：直接用 Entity 会暴露内部字段（密码、内部成本）、表结构变化击穿 API、
无法表达计算/聚合字段、无法区分新增与修改的校验规则、无法脱敏。
DTO 负责入参校验，VO 负责出参裁剪与聚合，Entity 只在内层流动。

**Q：@Transactional 为什么不能放 Controller？**
A：Controller 不是业务层。事务边界应包裹"必须原子的业务操作"，而 Controller 可能还包含
参数校验、响应序列化等非事务工作。放 Controller 会导致事务范围过大（含着序列化时间），
而且其他入口（定时任务）复用业务逻辑时没有事务。

**Q：什么情况下必须写 Service 接口？**
A：有多个实现（策略）、跨团队协作（先定契约）、需要 Mock 测试复杂依赖、需要 JDK 动态代理。
单纯 CRUD 且永远单实现时，接口只是噪音。

**Q：AOP 为什么不生效？**
A：① 同类内部调用（this.method()）；② 方法非 public；③ 类不是 Spring Bean；
④ 切点表达式写错（漏了 `..` 不含子包）；⑤ catch 了异常没重新抛出导致事务失效。

**Q：如何判断分层是否合理？**
A：看"改一个需求要动几个文件"。如果加一个校验规则要同时改 Controller、Service、XML，
说明职责混乱。合理分层下，规则变化只影响 Service（可能加 DTO 注解）。
:::

---

## 延伸练习

1. 打开 `project/bookhub`，画出 Controller → Service → Mapper 的调用链（含 DTO/VO 转换点）。
2. 找一个你写过的 Controller，数一数有几行是业务逻辑，全部搬到 Service 里。
3. 用 AOP 写一个"记录每个 Service 方法耗时"的切面，超过 500ms 打 warn。
4. 复现 AOP 自调用失效：在 Service 里写 `outer()` 调 `this.inner()`（inner 有 @Cached），
   验证缓存没生效，再用三种方式修复。
5. 把 `bookhub` 改成"按功能分包"结构（book/ reader/ borrow/），对比找文件的效率。
6. 写一个 `@RequireRole` 注解 + 切面，要求只有 role=ADMIN 才能调用删除接口。

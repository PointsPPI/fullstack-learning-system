# Spring Boot

::: key 一句话抓住本质
Spring Boot 做的事只有一句：**把"配置 Spring"这件事自动化，让你只写业务代码。**
它不是新框架，是 Spring 的"自动装配 + 内嵌容器 + 起步依赖"三件套的封装。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 自动配置原理与条件注解 | 为什么引入 starter 就有 Bean |
| 2 | 起步依赖与配置文件 | yml / profile / 配置优先级 |
| 3 | REST 注解与参数绑定 | 一个接口怎么接参数 |
| 4 | 参数校验 @Valid | 让非法请求进不来 |
| 5 | 统一响应与全局异常 | 前端只处理一种结构 |
| 6 | 拦截器 vs 过滤器 | 两个"拦路虎"的区别 |
| 7 | AOP | 日志/事务/权限怎么横切 |
| 8 | 事务与失效场景 | 为什么 @Transactional 不生效 |
| 9 | 测试 MockMvc | 不用启动 Tomcat 也能测接口 |

---

## 一、自动配置原理

### @SpringBootApplication 是什么

```java
@SpringBootApplication
public class BookHubApplication {
    public static void main(String[] args) {
        SpringApplication.run(BookHubApplication.class, args);
    }
}
```

这一个注解等于三个：

```java
@SpringBootConfiguration    // 本质是 @Configuration，标记这是配置类
@EnableAutoConfiguration    // ★ 开启自动配置（核心）
@ComponentScan              // 扫描当前包及子包的 @Component
```

::: key @ComponentScan 的扫描范围
默认扫描**启动类所在包及其子包**。

```
com.bookhub.BookHubApplication          ← 启动类在这
├── com.bookhub.common      ✓ 会扫描
├── com.bookhub.controller  ✓ 会扫描
├── com.bookhub.service     ✓ 会扫描
└── com.bookhub.dao         ✓ 会扫描

com.other.SomeService       ✗ 扫不到（不在子包内）
```

**这是"Bean 找不到"最常见的原因**：启动类放太深，或者把工具类放在别的包。
解法：启动类放最外层包，或用 `@ComponentScan("com.bookhub")` 显式指定。
:::

### 自动配置怎么发生的

::: key 三步
**① 收集候选配置类**

`@EnableAutoConfiguration` 会通过 `AutoConfigurationImportSelector` 读取：

```
jar 包里的 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

这个文件里列了几百个配置类的全限定名，比如：
```
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
org.springframework.boot.autoconfigure.mybatis.MybatisAutoConfiguration
```

**② 用条件注解过滤**

每个配置类上都有 `@ConditionalOnXxx`，只有条件满足才生效。

**③ 生效的配置类注册 Bean**

比如 `DataSourceAutoConfiguration` 会创建一个 `DataSource` Bean。
所以你只要在 yml 里写 `spring.datasource.url`，就能直接用 `DataSource`。
:::

### 常用条件注解

| 注解 | 生效条件 |
|---|---|
| `@ConditionalOnClass` | classpath 里有某个类（如 `MybatisAutoConfiguration` 要求有 `SqlSessionFactory`） |
| `@ConditionalOnMissingBean` | 容器里**没有**某个 Bean（所以你自定义的会覆盖默认的） |
| `@ConditionalOnBean` | 容器里**有**某个 Bean |
| `@ConditionalOnProperty` | 配置项存在且等于某值 |
| `@ConditionalOnWebApplication` | 是 Web 应用 |
| `@ConditionalOnSingleCandidate` | 某类型 Bean 只有一个或一个 primary |

::: tip 这就是"约定优于配置"的实现
```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)          // 有 DataSource 类才生效
@ConditionalOnMissingBean(DataSource.class)    // 用户没自己配才生效
public class DataSourceAutoConfiguration {
    @Bean
    @ConditionalOnProperty("spring.datasource.url")
    public DataSource dataSource(...) { ... }
}
```

**`@ConditionalOnMissingBean` 是关键**：
它让你自定义的 Bean 优先于框架默认的，实现"既开箱即用，又可精细控制"。
:::

### 怎么看自动配置报告

```bash
# 启动时加参数，打印哪些配置生效了、哪些没生效
java -jar bookhub.jar --debug
# 或
mvn spring-boot:run -Dspring-boot.run.arguments=--debug
```

输出中会有一段：
```
============================
CONDITIONS EVALUATION REPORT
============================
Positive matches:          ← 生效的
-----------------
   DataSourceAutoConfiguration matched:
      - @ConditionalOnClass found required class 'javax.sql.DataSource'

Negative matches:          ← 没生效的，带原因
-----------------
   GsonAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class 'com.google.gson.Gson'
```

::: lab 动手查自动配置
```java
@SpringBootTest
public class AutoConfigTest {
    @Autowired ApplicationContext ctx;

    @Test
    void listAllBeans() {
        // 打印容器里所有的 Bean（会看到好几百个）
        Arrays.stream(ctx.getBeanDefinitionNames())
              .sorted()
              .forEach(System.out::println);
    }
}
```
把输出存下来，就是一封"Spring Boot 到底给了我什么"的清单。
:::

---

## 二、起步依赖与配置文件

### starter 的作用

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

这一个依赖 = `spring-webmvc` + `spring-web` + `tomcat-embed-core` + `jackson-databind` + `validation` + ...
**十几个依赖，版本互相兼容**。

::: key starter 的价值不是"省代码"，是"省兼容性排查"
自己拼这些依赖，你会遇到 Jackson 版本和 Spring 版本不匹配、
Tomcat 版本和 servlet-api 不匹配等一堆问题。
官方的 starter 已经做过兼容性测试。
:::

常用 starter：

| starter | 内容 |
|---|---|
| `spring-boot-starter-web` | MVC + 内嵌 Tomcat + Jackson |
| `spring-boot-starter-webflux` | 响应式 Web（Netty） |
| `spring-boot-starter-data-jpa` | JPA + Hibernate |
| `spring-boot-starter-validation` | Hibernate Validator |
| `spring-boot-starter-aop` | AOP（AspectJ） |
| `spring-boot-starter-test` | JUnit5 + Mockito + AssertJ + MockMvc |
| `mybatis-spring-boot-starter` | MyBatis（第三方） |

### 配置文件

```yaml
# application.yml
server:
  port: 8080
  servlet:
    context-path: /api        # 所有路径加前缀

spring:
  application:
    name: bookhub
  datasource:
    url: jdbc:mysql://localhost:3307/bookhub?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    username: bh
    password: bh_pwd_2026
    driver-class-name: com.mysql.cj.jdbc.Driver
    hikari:
      maximum-pool-size: 10
      minimum-idle: 2
      connection-timeout: 3000
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: Asia/Shanghai
    default-property-inclusion: non_null   # null 字段不返回

mybatis:
  mapper-locations: classpath:mapper/*.xml
  type-aliases-package: com.bookhub.entity
  configuration:
    map-underscore-to-camel-case: true     # 驼峰映射

logging:
  level:
    com.bookhub: debug
    org.springframework: warn
```

::: danger yml 三个必踩的坑
```yaml
# ① 缩进必须是空格，不能用 Tab
spring:
	datasource:      ← Tab！直接启动失败，报 "found character '\t' that cannot start any token"

# ② 冒号后面必须有空格
port:8080          ← ✗ 这会被解析成键 "port:8080"
port: 8080         ← ✓

# ③ 特殊字符要引号
password: 123#456  ← ✗ # 后面被当注释，实际密码是 "123"
password: "123#456" ← ✓
password: '@abc'   ← 以 @ 开头必须加引号（YAML 保留字符）
```
:::

### profile 多环境

```yaml
# application.yml（公共配置）
spring:
  application:
    name: bookhub

---
# application-dev.yml
spring:
  datasource:
    url: jdbc:mysql://localhost:3307/bookhub
logging:
  level:
    com.bookhub: debug

---
# application-prod.yml
spring:
  datasource:
    url: jdbc:mysql://prod-host:3306/bookhub
logging:
  level:
    com.bookhub: info
```

激活方式（优先级从高到低）：

```bash
# ① 命令行参数（最高）
java -jar app.jar --spring.profiles.active=prod

# ② 环境变量
export SPRING_PROFILES_ACTIVE=prod

# ③ application.yml 里指定
```

```yaml
spring:
  profiles:
    active: dev
```

::: warn 配置的优先级（从高到低，记前四个就够）
1. **命令行参数** `--server.port=9090`
2. **环境变量** / JNDI
3. **外部配置文件**（jar 同目录的 `application.yml`、`config/` 目录）
4. **jar 内 application-{profile}.yml**
5. **jar 内 application.yml**
6. `@PropertySource` 注解
7. 默认值（`SpringApplication.setDefaultProperties`）

**记忆口诀：命令行 > 环境变量 > 外部文件 > profile 文件 > 基础文件**
:::

### @Value 与 @ConfigurationProperties

```java
// 单个值
@Value("${server.port}")
private int port;

@Value("${app.name:默认名}")     // 冒号后是默认值
private String name;

// 一组值（推荐，类型安全 + 可校验）
@ConfigurationProperties(prefix = "app")
@Component
@Validated
public class AppProperties {
    @NotBlank private String name;
    @Min(1) private int maxBorrowDays = 30;
    private List<String> whitelist = new ArrayList<>();
    // getter / setter
}
```

::: key 为什么推荐 @ConfigurationProperties
```java
// ✗ @Value 散落各处，改一个配置名要全局搜索
@Value("${app.max-borrow-days}") private int maxDays;
@Value("${app.name}") private String name;

// ✓ 集中管理，IDE 有提示，支持嵌套/列表/校验/默认值
@ConfigurationProperties(prefix = "app")
```
配置超过 3 个就用 `@ConfigurationProperties`。
:::

---

## 三、REST 注解与参数绑定

### 六大注解

| 注解 | 接收什么 | 典型场景 |
|---|---|---|
| `@PathVariable` | URL 路径里的 `{id}` | `GET /books/1` |
| `@RequestParam` | 查询串 `?kw=x` 或表单 | `GET /books?kw=x` |
| `@RequestBody` | JSON 请求体 | `POST /books` |
| `@RequestPart` | multipart 的一部分 | 文件上传 |
| `@ModelAttribute` | 表单字段 → 对象 | 传统表单提交 |
| `@RequestHeader` / `@CookieValue` | 头 / Cookie | 取 token |

### 完整示例

```java
@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService service;

    // 构造注入（Spring 4.3+ 单构造器可省略 @Autowired）
    public BookController(BookService service) {
        this.service = service;
    }

    /** 列表：查询参数 + 分页 */
    @GetMapping
    public R<PageResult<BookVO>> list(BookQueryDTO query) {
        // GET 没有请求体，Spring 自动把 ?kw=&page= 绑定到 DTO 的 setter
        return R.ok(service.page(query));
    }

    /** 详情：路径参数 */
    @GetMapping("/{id}")
    public R<BookDetailVO> detail(@PathVariable Long id) {
        return R.ok(service.detail(id));
    }

    /** 新增：JSON 请求体 + 校验 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public R<Long> create(@Valid @RequestBody BookCreateDTO dto) {
        return R.ok(service.create(dto));
    }

    /** 修改 */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody BookUpdateDTO dto) {
        service.update(id, dto);
        return R.ok();
    }

    /** 删除 */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    /** 业务动作：借书 */
    @PostMapping("/{id}/borrow")
    public R<BorrowVO> borrow(
            @PathVariable Long id,
            @RequestBody BorrowCreateDTO dto,
            @RequestHeader(value = "X-Client", required = false) String client) {
        return R.ok(service.borrow(id, dto.readerId()));
    }

    /** 文件上传 */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<String> upload(@RequestPart("file") MultipartFile file) {
        return R.ok(service.saveCover(file));
    }
}
```

### @RequestParam vs @PathVariable

```java
// 路径参数：识别"哪个资源"
@GetMapping("/books/{id}")           // /books/42  →  id=42
public R<Book> get(@PathVariable Long id)

// 查询参数：过滤/分页/可选
@GetMapping("/books")                 // /books?kw=java&page=1
public R<Page> list(@RequestParam(required = false) String kw,
                    @RequestParam(defaultValue = "1") int page)
```

::: danger 三个高频错误
```java
// ① 忘记 @RequestBody → 参数是 null
public R<Long> create(BookCreateDTO dto)      // ✗ dto 为 null
public R<Long> create(@RequestBody BookCreateDTO dto)  // ✓

// ② 想接 JSON 却用了 @RequestParam → 绑定失败
@PostMapping("/x")
public void a(@RequestParam String title)     // ✗ 前端发的是 JSON body

// ③ GET 请求用了 @RequestBody → 虽然 Spring 支持，但不符合语义，很多代理会丢 body
@GetMapping("/x")
public void a(@RequestBody Foo f)             // ✗ 改用查询参数或 DTO setter 绑定
```
:::

### 返回值处理

```java
// 返回对象 → 自动 JSON 序列化（Jackson）
@GetMapping("/{id}")
public BookVO detail(@PathVariable Long id) { ... }

// 需要控制状态码/响应头 → ResponseEntity
@PostMapping
public ResponseEntity<R<Long>> create(@RequestBody @Valid BookCreateDTO dto) {
    Long id = service.create(dto);
    return ResponseEntity
            .created(URI.create("/api/books/" + id))    // 201
            .body(R.ok(id));
}

// 返回 void + @ResponseStatus
@DeleteMapping("/{id}")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void delete(@PathVariable Long id) { ... }
```

---

## 四、参数校验 @Valid

### 基础用法

```java
public record BookCreateDTO(
    @NotBlank(message = "书名不能为空")
    @Size(max = 200, message = "书名最多 200 字")
    String title,

    @NotNull(message = "价格不能为空")
    @DecimalMin(value = "0.00", message = "价格不能为负")
    BigDecimal price,

    @NotNull
    @Min(0)
    Integer total,

    @Email(message = "邮箱格式不正确")
    String contactEmail
) {}
```

```java
@PostMapping
public R<Long> create(@Valid @RequestBody BookCreateDTO dto) { ... }
```

::: danger 校验不生效的四个原因（按出现频率排序）
1. **没加 `@Valid`**（或 `@Validated`）—— 最常见
2. **没引入 `spring-boot-starter-validation`** —— Spring Boot 2.3+ 起不再自动包含
3. **在 Service 层校验却没用 `@Validated` 标注类** —— 方法级校验需要类上有 `@Validated`
4. **校验的是嵌套对象的字段，但没加 `@Valid`** —— 嵌套校验必须级联
:::

```java
// 嵌套校验：不加 @Valid 就只校验 order 本身，不校验 item
public class OrderDTO {
    @NotNull private Long userId;
    @Valid @NotNull private List<OrderItemDTO> items;   // ← 关键
}
```

### 常用校验注解

| 注解 | 适用类型 | 说明 |
|---|---|---|
| `@NotNull` | 任意 | 不能为 null（空串可以） |
| `@NotBlank` | String | 不能为 null 且去空格后非空 |
| `@NotEmpty` | String/集合 | 不能 null 且长度 > 0 |
| `@Size(min,max)` | String/集合/数组 | 长度范围 |
| `@Min` / `@Max` | 数值 | 数值范围 |
| `@DecimalMin` / `@DecimalMax` | BigDecimal | 小数范围 |
| `@Pattern(regexp)` | String | 正则 |
| `@Email` | String | 邮箱格式 |
| `@Past` / `@Future` | 日期 | 过去/未来 |
| `@Positive` / `@Negative` | 数值 | 正/负 |

::: warn @NotNull vs @NotBlank vs @NotEmpty
```java
@NotNull  String s;   // s = ""     ✓ 通过（不为 null）
@NotBlank String s;   // s = ""     ✗ 失败（去空格后为空）
@NotEmpty String s;   // s = ""     ✗ 失败（长度 0）

@NotNull  List l;     // l = []     ✓ 通过
@NotEmpty List l;     // l = []     ✗ 失败
```
**字符串用 @NotBlank，集合用 @NotEmpty，其他用 @NotNull。**
:::

### 分组校验（新增 vs 修改规则不同）

```java
public interface Create {}
public interface Update {}

public record BookDTO(
    @NotBlank(groups = {Create.class, Update.class}) String title,
    @NotNull(groups = Create.class) Long categoryId,   // 修改时可以不改分类
    @Null(groups = Create.class) Long id               // 新增时不允许传 id
) {}

@PostMapping
public R<Long> create(@Validated(Create.class) @RequestBody BookDTO dto) { }

@PutMapping("/{id}")
public R<Void> update(@Validated(Update.class) @RequestBody BookDTO dto) { }
```

### 自定义校验

```java
@Target({ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PhoneValidator.class)
public @interface Phone {
    String message() default "手机号格式不正确";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class PhoneValidator implements ConstraintValidator<Phone, String> {
    private static final Pattern P = Pattern.compile("^1[3-9]\\d{9}$");
    @Override
    public boolean isValid(String v, ConstraintValidatorContext ctx) {
        return v == null || P.matcher(v).matches();   // null 交给 @NotNull 处理
    }
}
```

---

## 五、统一响应与全局异常

### 统一响应结构

```java
public record R<T>(int code, String message, T data, long timestamp) {
    public static <T> R<T> ok(T data) {
        return new R<>(0, "ok", data, System.currentTimeMillis());
    }
    public static R<Void> ok() {
        return new R<>(0, "ok", null, System.currentTimeMillis());
    }
    public static <T> R<T> fail(ResultCode rc) {
        return new R<>(rc.getCode(), rc.getMessage(), null, System.currentTimeMillis());
    }
}
```

::: key 业务码和 HTTP 状态码要分开
```
HTTP 200 + code 0      → 真成功
HTTP 200 + code 20001  → 请求本身没错，是业务说"书不存在"
HTTP 400 + code 10001  → 参数校验失败
HTTP 500 + code 15000  → 服务端崩了
```

**为什么不全用 HTTP 状态码表达业务错误？**
因为 HTTP 状态码只有几十个，而业务错误有几百个。
而且用 4xx 表达"库存不足"这类业务状态，会让监控系统误判成"接口故障"。

**为什么不全用 200 + code 表达？**
因为那样就失去了 HTTP 的语义，缓存、监控、网关限流全都看不懂。
:::

### 全局异常处理器

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 业务异常：预料之中 → HTTP 200 + 业务码 */
    @ExceptionHandler(BizException.class)
    public R<Void> handleBiz(BizException e, HttpServletRequest req) {
        log.warn("业务异常 uri={} code={} msg={}", req.getRequestURI(),
                 e.getResultCode().getCode(), e.getMessage());
        return R.fail(e.getResultCode(), e.getMessage());
    }

    /** 参数校验失败 → 400 + 字段级错误 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<Map<String, String>> handleValid(MethodArgumentNotValidException e) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fe : e.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        return R.fail(10001, "参数校验失败", errors);
    }

    /** 兜底：未预期异常 → 500，日志打全栈，响应不暴露细节 */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<Void> handleAll(Exception e, HttpServletRequest req) {
        log.error("未捕获异常 uri={}", req.getRequestURI(), e);
        return R.fail(15000, "系统繁忙，请稍后重试");
    }
}
```

::: danger 为什么兜底处理绝不能返回 e.getMessage()
```java
// ✗ 泄露内部信息
return R.fail(500, e.getMessage());
```
`e.getMessage()` 可能是：
- `Table 'bookhub.book' doesn't exist` → 泄露表名
- `Duplicate entry 'admin' for key 'uk_username'` → 泄露数据
- `Access denied for user 'root'@'10.0.0.5'` → 泄露内网 IP 和账号
- 完整 SQL 语句 → 泄露表结构

**给用户看通用文案，给日志看完整堆栈。**
:::

### BizException 的意义

```java
// ✗ 业务错误当返回值：每个方法都要写一遍
public Book get(Long id) {
    Book b = mapper.findById(id);
    if (b == null) return null;      // 调用方还要判 null
    return b;
}

// ✓ 抛异常 + 全局处理
public Book get(Long id) {
    return mapper.findById(id)
            .orElseThrow(() -> new BizException(ResultCode.BOOK_NOT_FOUND));
}
```

::: key 为什么必须继承 RuntimeException
```java
public class BizException extends RuntimeException { }   // ✓
public class BizException extends Exception { }           // ✗ 三个问题
```
1. 受检异常要求调用方必须 try-catch 或 throws → 代码污染
2. **`@Transactional` 默认只对 RuntimeException 回滚** → 业务异常不回滚，事务失效
3. 与 Spring 的异常处理约定不符
:::

---

## 六、拦截器 vs 过滤器

::: compare 本质区别
| | Filter（过滤器） | Interceptor（拦截器） |
|---|---|---|
| 规范 | **Servlet** 规范 | **Spring MVC** 规范 |
| 容器 | Tomcat | Spring |
| 作用范围 | 所有请求（含静态资源、非 Spring 的 Servlet） | 只拦截 DispatcherServlet 处理的请求 |
| 能拿到什么 | request/response | request/response + **HandlerMethod**（知道调用哪个方法） |
| 能否拿到方法注解 | ❌ | ✅ `handler.getMethodAnnotation(...)` |
| 执行时机 | 进入 Servlet 容器前后 | DispatcherServlet 内部、Handler 前后 |
| Spring Bean | 需要特殊处理（`FilterRegistrationBean`） | 天然是 Bean，可注入依赖 |
:::

### 执行顺序

```
请求
 ↓
① Filter.doFilter 前置
 ↓
② DispatcherServlet
 ↓
③ Interceptor.preHandle          ← 返回 false 则中断
 ↓
④ Controller 方法
 ↓
⑤ Interceptor.postHandle
 ↓
⑥ 视图渲染（REST 无此步）
 ↓
⑦ Interceptor.afterCompletion
 ↓
⑧ Filter.doFilter 后置（响应返回）
 ↓
响应
```

::: warn 异常时哪些钩子不执行
Controller 抛异常时：
- `postHandle` **不执行**（因为没正常返回）
- `afterCompletion` **仍执行**（用于资源清理）
:::

### 拦截器实现

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwt;

    public AuthInterceptor(JwtUtil jwt) { this.jwt = jwt; }

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler)
            throws Exception {
        // 放行非方法处理器（如静态资源）
        if (!(handler instanceof HandlerMethod hm)) return true;

        // 放行标注了 @Public 的方法
        if (hm.getMethodAnnotation(Public.class) != null) return true;

        // ★ 放行 OPTIONS 预检（否则 CORS 全挂）
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return true;

        String token = req.getHeader("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            writeJson(res, 401, 10001, "未登录");
            return false;   // 中断，不再进入 Controller
        }
        try {
            Long userId = jwt.parse(token.substring(7));
            // 放到 ThreadLocal，后续 Service 层能取
            UserContext.set(userId);
            return true;
        } catch (Exception e) {
            writeJson(res, 401, 10002, "登录已过期");
            return false;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                                Object handler, Exception ex) {
        UserContext.clear();   // ★ 必须清理，否则线程池复用会串数据
    }

    private void writeJson(HttpServletResponse res, int status, int code, String msg)
            throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"code\":" + code + ",\"message\":\"" + msg + "\"}");
    }
}
```

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;
    public WebConfig(AuthInterceptor i) { this.authInterceptor = i; }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/login", "/api/auth/register", "/error");
    }
}
```

::: danger ThreadLocal 泄漏 —— 线上事故级问题
```java
// ✗ 忘记清理
preHandle: UserContext.set(userId);
// 请求结束，线程回到线程池，ThreadLocal 里还留着上一个用户的数据
// 下一个请求进来如果没重新 set，就会读到别人的 userId → 越权
```
Tomcat 的线程会复用（默认 200 个线程处理无限请求），
所以 **`afterCompletion` 里的 `clear()` 是必须的**。
:::

### 过滤器实现

```java
@Component
@Order(1)
public class TraceIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String traceId = req.getHeader("X-Trace-Id");
        if (traceId == null) traceId = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("traceId", traceId);        // 日志里带上 traceId
        res.setHeader("X-Trace-Id", traceId);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();
        }
    }
}
```

::: tip 怎么选
- 需要**知道调用哪个方法/注解** → 拦截器
- 需要**处理所有请求**（含静态资源、非 Spring Servlet） → 过滤器
- 需要**修改 request/response 的原始流**（如包装 body 做日志、GZIP） → 过滤器
- 需要**依赖注入业务 Bean** → 拦截器（过滤器也可以但要用 `FilterRegistrationBean`）

常见搭配：过滤器做编码/追踪ID/压缩，拦截器做鉴权/权限/日志。
:::

---

## 七、AOP

::: key 一句话
AOP 让你把"和业务无关但到处都需要"的代码（日志、事务、权限、缓存、限流），
**从业务代码里抽出来，统一在切面里处理**。
:::

### 核心概念

| 概念 | 含义 |
|---|---|
| **切面（Aspect）** | 横切关注点的模块化（一个类） |
| **连接点（JoinPoint）** | 可以插入切面的点（Spring 里就是方法调用） |
| **切点（Pointcut）** | 表达式，选中哪些连接点 |
| **通知（Advice）** | 在切点做什么（Before/After/Around/AfterReturning/AfterThrowing） |
| **织入（Weaving）** | 把切面应用到目标对象的过程（Spring 用动态代理） |

### 五种通知

```java
@Aspect
@Component
@Order(1)
public class LogAspect {

    private static final Logger log = LoggerFactory.getLogger(LogAspect.class);

    /** 切点：com.bookhub.service 包下所有 public 方法 */
    @Pointcut("execution(public * com.bookhub.service..*.*(..))")
    public void servicePointcut() {}

    /** 前置 */
    @Before("servicePointcut()")
    public void before(JoinPoint jp) {
        log.debug("→ {} 参数={}", jp.getSignature().toShortString(),
                  Arrays.toString(jp.getArgs()));
    }

    /** 环绕：最强，能改参数、改返回值、控制是否执行 */
    @Around("servicePointcut() && @annotation(com.bookhub.aspect.Timed)")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed();                 // 执行目标方法
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            if (ms > 500) log.warn("慢方法 {} 耗时 {}ms", pjp.getSignature().toShortString(), ms);
        }
    }

    /** 正常返回后 */
    @AfterReturning(pointcut = "servicePointcut()", returning = "ret")
    public void afterReturning(JoinPoint jp, Object ret) {
        log.debug("← {} 返回={}", jp.getSignature().toShortString(), ret);
    }

    /** 抛异常后 */
    @AfterThrowing(pointcut = "servicePointcut()", throwing = "e")
    public void afterThrowing(JoinPoint jp, Throwable e) {
        log.error("✗ {} 异常", jp.getSignature().toShortString(), e);
    }

    /** 最终（无论成败） */
    @After("servicePointcut()")
    public void after(JoinPoint jp) { }
}
```

### 切点表达式

```java
// execution(修饰符 返回类型 包.类.方法(参数))
execution(* com.bookhub.service.*.*(..))        // service 包下所有类所有方法
execution(* com.bookhub..*.*(..))               // service 及子包
execution(public * *(..))                       // 所有 public 方法
execution(* save*(..))                          // 所有以 save 开头的方法
execution(* *(.., String, ..))                  // 参数里含 String 的方法

// 按注解
@annotation(org.springframework.transaction.annotation.Transactional)
@within(org.springframework.stereotype.Service)
@target(...)

// 组合
execution(* com.bookhub.service..*.*(..)) && !@annotation(com.bookhub.aspect.NoLog)
```

::: warn execution 表达式的作用范围（高频坑）
```java
// ✗ 只匹配"直接"在 service 包下的类，不含子包
execution(* com.bookhub.service.*.*(..))

// ✓ .. 表示含子包
execution(* com.bookhub.service..*.*(..))
```
另外，**同一个类内部方法调用（this.foo()）不会走代理**，所以 AOP 不生效。
:::

### AOP 的实现原理

::: key Spring 用动态代理
- **目标类实现了接口** → 默认用 **JDK 动态代理**（`Proxy.newProxyInstance`）
- **目标类没有接口** → 用 **CGLIB**（生成子类，覆写方法）

Spring Boot 2.x 起默认 **`spring.aop.proxy-target-class=true`**（统一用 CGLIB），
因为 CGLIB 没有"必须实现接口"的限制。

**这也解释了为什么 @Transactional 在同类内部调用时失效**：
内部调用是 `this.method()`，走的是原始对象，不经过代理。
:::

---

## 八、事务与失效场景

### 基础用法

```java
@Service
public class BorrowServiceImpl implements BorrowService {

    @Transactional(rollbackFor = Exception.class)
    public Long borrow(Long bookId, Long readerId) {
        // 1. 扣库存
        int rows = bookMapper.decreaseStock(bookId);
        if (rows == 0) throw new BizException(ResultCode.BOOK_STOCK_EMPTY);

        // 2. 插借阅记录
        Borrow b = new Borrow();
        b.setBookId(bookId); b.setReaderId(readerId);
        borrowMapper.insert(b);

        return b.getId();
    }
}
```

### @Transactional 的属性

```java
@Transactional(
    rollbackFor = Exception.class,          // 哪些异常回滚（默认只 RuntimeException）
    noRollbackFor = BizException.class,     // 哪些不回滚
    propagation = Propagation.REQUIRED,     // 传播行为
    isolation = Isolation.REPEATABLE_READ,  // 隔离级别
    timeout = 30,                           // 超时（秒）
    readOnly = false                        // 只读优化
)
```

### 七种传播行为

| 值 | 说明 | 场景 |
|---|---|---|
| `REQUIRED`（默认） | 有事务就加入，没有就新建 | 大多数情况 |
| `REQUIRES_NEW` | 总是新建，挂起外层事务 | 记日志（无论主业务成败都要留） |
| `SUPPORTS` | 有就加入，没有就非事务执行 | 查询 |
| `NOT_SUPPORTED` | 非事务执行，挂起外层 | 不重要的操作 |
| `MANDATORY` | 必须有事务，否则抛异常 | 强制在事务内调用 |
| `NEVER` | 必须无事务，否则抛异常 | |
| `NESTED` | 嵌套事务（savepoint） | 子操作失败不影响主操作 |

::: key REQUIRED vs REQUIRES_NEW 的关键差别
```java
@Transactional                       // 外层
public void outer() {
    try {
        inner();                     // REQUIRES_NEW
    } catch (Exception e) {
        // 内层已回滚，但外层不受影响
    }
    // 继续执行
}

@Transactional(propagation = REQUIRES_NEW)
public void inner() { ... }
```
`REQUIRED` 是同一个事务，内层回滚会导致整个事务被标记为 rollback-only，外层也提交不了。
:::

### 事务失效的八个场景（面试必考）

::: danger 逐条对照
**① 方法不是 public**
```java
@Transactional
private void save() { }     // ✗ 代理无法拦截 private 方法
```

**② 同类内部调用（最常见）**
```java
public void outer() {
    this.inner();           // ✗ 走的是原始对象，不是代理 → 事务失效
}
@Transactional
public void inner() { }
// 解法：self 注入 / AopContext.currentProxy() / 拆到另一个类
```

**③ 异常被 catch 吞掉**
```java
@Transactional
public void save() {
    try { doSave(); }
    catch (Exception e) { log.error("失败", e); }   // ✗ 没抛出 → 不回滚
}
```

**④ 抛的是受检异常**
```java
@Transactional                          // 默认只回滚 RuntimeException + Error
public void save() throws IOException {
    throw new IOException();            // ✗ 不回滚
}
// 解法：@Transactional(rollbackFor = Exception.class)
```

**⑤ 类没有被 Spring 管理**
```java
public class MyService { @Transactional public void save() {} }   // ✗ 没有 @Service
```

**⑥ 数据库引擎不支持事务**
```sql
CREATE TABLE t (...) ENGINE = MyISAM;   -- ✗ MyISAM 不支持事务
```

**⑦ 多数据源/多事务管理器，没指定用哪个**
```java
@Transactional("orderTxManager")        // ✓ 显式指定
```

**⑧ 传播行为设成 NOT_SUPPORTED**
```java
@Transactional(propagation = Propagation.NOT_SUPPORTED)   // ✗ 根本不走事务
```
:::

### 事务的底层

```
@Transactional
  ↓
TransactionInterceptor（AOP 环绕通知）
  ↓
① 获取/创建事务（ThreadLocal 里存 Connection）
② 关闭自动提交 connection.setAutoCommit(false)
③ 执行目标方法
④ 正常返回 → commit
⑤ 抛异常（匹配 rollbackFor）→ rollback
⑥ 清理 ThreadLocal，恢复自动提交，归还连接
```

::: warn 事务里千万不要做这些
```java
@Transactional
public void save() {
    // ✗ 调用外部 HTTP 接口（耗时长，事务一直开着，锁一直持有）
    httpClient.post(...);

    // ✗ 发消息/发邮件（事务还没提交，消息已经发出去了；回滚了消息撤不回来）
    mq.send(...);

    // ✗ 大量查询（延长事务，加剧锁竞争）
    list.forEach(this::heavyQuery);
}
```
原则：**事务范围要尽可能小，只包裹"必须原子"的数据库操作。**
外部调用、消息发送应该在事务**之后**（用 `TransactionSynchronization` 的 afterCommit 或事件机制）。
:::

---

## 九、测试

### @SpringBootTest + MockMvc

```java
@SpringBootTest
@AutoConfigureMockMvc
class BookControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper om;

    @Test
    void 列表_应返回200和统一结构() throws Exception {
        mockMvc.perform(get("/api/books").param("page", "1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(0))
               .andExpect(jsonPath("$.data.list").isArray());
    }

    @Test
    void 新增_非法参数应返回400和字段错误() throws Exception {
        var dto = new BookCreateDTO("", "作者", null, 1L, new BigDecimal("10"), 1, 1, null);
        mockMvc.perform(post("/api/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(dto)))
               .andExpect(status().isBadRequest())
               .andExpect(jsonPath("$.code").value(10001))
               .andExpect(jsonPath("$.data.title").value("书名不能为空"));
    }

    @Test
    void 详情_不存在应返回业务码() throws Exception {
        mockMvc.perform(get("/api/books/99999"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.code").value(20001));
    }
}
```

### 用 H2 做测试数据库

```yaml
# src/test/resources/application-test.yml
spring:
  datasource:
    url: jdbc:h2:mem:testdb;MODE=MySQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  sql:
    init:
      mode: always
      schema-locations: classpath:db/01-schema.sql
      data-locations: classpath:db/02-data.sql
```

::: tip 为什么测试要用 H2 而不是生产 MySQL
1. **快**：内存库，启动 100ms
2. **隔离**：每次测试都是干净数据，不会污染
3. **无依赖**：CI 环境不需要装 MySQL

代价：H2 的 SQL 方言和 MySQL 有差异（`MODE=MySQL` 能缓解大部分）。
**关键 SQL 仍需在真实 MySQL 上验证**（本工坊的 labs/sql 就是干这个的）。
:::

### 三种测试分层

| 类型 | 注解 | 速度 | 覆盖 |
|---|---|---|---|
| **单元测试** | `@ExtendWith(MockitoExtension.class)` | 毫秒 | 单个类，依赖全 mock |
| **切片测试** | `@WebMvcTest` / `@MybatisTest` | 秒 | 只加载 Web 层 / 只加载持久层 |
| **集成测试** | `@SpringBootTest` | 十秒 | 整个容器 |

::: key 测试金字塔
```
        /\        少量集成测试（验证整体串起来）
       /  \
      /____\      适量切片测试（验证各层边界）
     /      \
    /________\    大量单元测试（验证逻辑正确）
```
倒过来（大量集成测试）会导致测试跑 30 分钟，没人愿意跑。
:::

---

## 十、本节速查

```java
// 启动三件套
@SpringBootApplication = @SpringBootConfiguration + @EnableAutoConfiguration + @ComponentScan
扫描范围 = 启动类所在包及子包

// 自动配置
读 AutoConfiguration.imports → 条件注解过滤 → 注册 Bean
@ConditionalOnClass / @ConditionalOnMissingBean / @ConditionalOnProperty
看报告：--debug

// 参数
@PathVariable（路径）/ @RequestParam（查询）/ @RequestBody（JSON）
@RequestPart（文件）/ @ModelAttribute（表单）
GET 用 DTO setter 绑定，POST 用 @RequestBody

// 校验
@Valid 必须加；嵌套要 @Valid 级联；需 starter-validation
@NotBlank 字符串 / @NotEmpty 集合 / @NotNull 其他

// 统一响应
R<T> { code, message, data, timestamp }
业务码 0 成功；HTTP 状态码表达协议层

// 异常
@RestControllerAdvice + @ExceptionHandler
BizException extends RuntimeException（事务才回滚）
兜底绝不返回 e.getMessage()

// Filter vs Interceptor
Filter：Servlet 层，所有请求
Interceptor：MVC 层，能拿 HandlerMethod，可注入 Bean
OPTIONS 必须放行；ThreadLocal 必须 clear

// 事务
@Transactional(rollbackFor = Exception.class)
默认只回滚 RuntimeException
失效：private / 同类调用 / catch 吞掉 / 受检异常 / 非 Bean

// 测试
@SpringBootTest + @AutoConfigureMockMvc → 打接口
H2 内存库 + MODE=MySQL
```

::: interview 面试高频
**Q：Spring Boot 自动配置的原理？**
A：`@EnableAutoConfiguration` 通过 `AutoConfigurationImportSelector` 读取
所有 jar 里的 `META-INF/spring/...AutoConfiguration.imports`，得到候选配置类列表，
再用 `@ConditionalOnXxx` 过滤，满足条件的配置类注册 Bean。
`@ConditionalOnMissingBean` 保证用户自定义的 Bean 优先。

**Q：@Transactional 为什么失效？列举场景。**
A：① 非 public 方法；② 同类内部 this 调用（不走代理）；
③ 异常被 catch 未抛出；④ 抛受检异常但未配 rollbackFor；
⑤ 类未被 Spring 管理；⑥ 存储引擎不支持事务（MyISAM）；
⑦ 多事务管理器未指定；⑧ 传播行为为 NOT_SUPPORTED。

**Q：Filter 和 Interceptor 的区别？**
A：Filter 属 Servlet 规范，由容器管理，拦截所有请求，拿不到 HandlerMethod；
Interceptor 属 Spring MVC，能拿到 HandlerMethod 和其上注解，可注入业务 Bean。
Filter 适合编码/压缩/追踪，Interceptor 适合鉴权/日志。

**Q：@RequestBody 和 @RequestParam 的区别？**
A：@RequestBody 从请求体读 JSON 并反序列化成对象（POST/PUT 用）；
@RequestParam 从 URL 查询串或表单读单个值。
GET 请求没有 body，不能用 @RequestBody。

**Q：为什么全局异常处理不能返回异常 message？**
A：会泄露表名、SQL、内网 IP、账号等敏感信息，帮助攻击者了解系统结构。
应返回通用文案，完整堆栈只写日志。

**Q：Bean 的循环依赖 Spring 怎么解决？**
A：通过三级缓存（singletonObjects / earlySingletonObjects / singletonFactories），
在创建 A 时提前暴露 A 的早期引用，让 B 能注入。
但**构造器注入的循环依赖无法解决**（见 IOC 章节）。
:::

---

## 延伸练习

1. 启动本工坊 bookhub，加 `--debug` 参数，找出 `DataSourceAutoConfiguration` 的生效原因。
2. 写一个 `@RestControllerAdvice`，让"图书不存在"返回 `{code:20001}` 且 HTTP 状态仍是 200。
3. 写一个拦截器，要求：`/api/**` 需要 `X-Token` 头，`OPTIONS` 放行，缺失时返回 JSON 401。
4. 复现事务失效：在 Service 里写 `outer()` 调用 `this.inner()`（inner 有 @Transactional），
   在 inner 里抛异常，观察库存是否被扣（没回滚就是失效了），再修复。
5. 写一个 AOP 切面，统计所有 Service 方法的耗时，超过 500ms 打 warn 日志。
6. 用 MockMvc 写三个测试：列表成功、参数校验失败、资源不存在，断言状态码和 code。

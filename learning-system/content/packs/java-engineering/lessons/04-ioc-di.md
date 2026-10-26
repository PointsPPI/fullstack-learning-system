# IOC 与 DI

::: key 一句话抓住本质
**IOC（控制反转）**：对象的创建与依赖装配的**控制权**，从"你的代码"反转到了"容器"。
**DI（依赖注入）**：容器把依赖**推**给你的对象，而不是你的对象自己去 `new`。

一个说"谁来控制"，一个说"控制之后怎么给"。DI 是 IOC 的实现手段。
:::

## 学习点

| # | 知识点 | 面试出现率 |
|---|---|---|
| 1 | 控制反转的本质 | ★★★★★ |
| 2 | 容器与 BeanDefinition | ★★★ |
| 3 | 三种注入方式与最佳实践 | ★★★★★ |
| 4 | Bean 作用域与生命周期 | ★★★★ |
| 5 | @Configuration 与 @Bean | ★★★★ |
| 6 | 循环依赖与三级缓存 | ★★★★★ |
| 7 | 条件装配 | ★★★ |

---

## 一、控制反转的本质

### 从"自己 new"到"容器给"

```java
// ============ 没有 IOC 的世界 ============
public class BookController {
    private BookService service = new BookServiceImpl();   // 硬编码依赖

    public void list() {
        // 如果 BookService 需要 BookMapper？
        // → BookServiceImpl 里又要 new BookMapperImpl
        // → BookMapperImpl 又要 new DataSource...
        // 依赖链越深，new 起来越痛苦
    }
}
```

```java
// ============ 有 IOC 的世界 ============
@RestController
public class BookController {
    private final BookService service;

    public BookController(BookService service) {   // 容器把实现塞进来
        this.service = service;
    }
}
```

::: key 反转了什么？
**控制权反转**：
| | 传统 | IOC |
|---|---|---|
| 谁创建对象 | 你的代码 `new` | **容器** |
| 谁决定实现类 | 你的代码硬编码 | **容器**（按配置/约定） |
| 谁管理生命周期 | 你的代码（可能忘记销毁） | **容器** |
| 谁负责注入依赖 | 你的代码手动传 | **容器** |

**"反转"这个词的精髓**：以前是"我要什么我自己拿"（主动），
现在是"我需要什么，它给我送过来"（被动）。这就是好莱坞原则：
**Don't call us, we'll call you.**（别来找我，我会找你）
:::

### 为什么这很重要（三个真实收益）

::: compare 手动 new 的三个痛点 → IOC 的三个收益
| 痛点 | 具体表现 | IOC 怎么解决 |
|---|---|---|
| **耦合** | Controller 里写了 `new BookServiceImpl()`，想换成缓存版要改代码 | 只写接口，实现由容器按需注入 |
| **难测** | 单元测试时没法替换成 Mock | 构造注入 + Mockito 直接传 mock |
| **重复** | 每个类都要自己管依赖、管生命周期 | 容器统一管理，单例复用 |
:::

```java
// 想加缓存？只改配置/注解，Controller 一行不动
@Service
@Primary                        // ← 或者用 @Qualifier 精确指定
public class CachedBookServiceImpl implements BookService { }

// 测试？
@Test
void test() {
    BookService mock = Mockito.mock(BookService.class);
    var controller = new BookController(mock);   // 直接传 mock，不需要容器
    // ...
}
```

---

## 二、容器与 BeanDefinition

### 容器是什么

```
ApplicationContext（容器）
├── BeanFactory（底层，懒加载）
│     ├── BeanDefinition 注册表（"配方"）
│     └── 单例池 singletonObjects（"成品"）
├── 事件发布（ApplicationEventPublisher）
├── 国际化（MessageSource）
└── 资源加载（ResourceLoader）
```

::: key BeanDefinition 是"配方"，Bean 是"成品"
```
BeanDefinition                    Bean 实例
──────────────                    ──────────
beanClassName: BookServiceImpl    ┌──────────────┐
scope: singleton                  │ BookServiceImpl │
lazyInit: false                   │  service = ...  │
dependsOn: [dataSource]           └──────────────┘
constructorArgValues: [...]
propertyValues: [...]
```

**Spring 启动的前半段就是在"读配方"**（解析注解/XML → 生成 BeanDefinition），
**后半段是"照配方做菜"**（实例化 → 填充属性 → 初始化）。
:::

### 三种注册 Bean 的方式

```java
// ① 注解 + 组件扫描（最常用）
@Service / @Component / @Repository / @Controller  → 类级别
配合 @ComponentScan（@SpringBootApplication 已包含）

// ② @Configuration + @Bean（第三方类，无法加注解时）
@Configuration
public class AppConfig {
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }
}

// ③ 手动注册（动态场景，很少用）
@Autowired ConfigurableApplicationContext ctx;
ctx.getBeanFactory().registerSingleton("myBean", new MyBean());
```

### 常用的 stereotype 注解

| 注解 | 语义 | 特殊能力 |
|---|---|---|
| `@Component` | 通用组件 | 基础 |
| `@Service` | 业务层 | 只是语义，功能同 Component |
| `@Repository` | 持久层 | **自动把数据库异常翻译成 DataAccessException** |
| `@Controller` | 控制器 | 配合视图解析 |
| `@RestController` | REST 控制器 | `@Controller` + `@ResponseBody` |

::: warn @Service 和 @Component 有区别吗？
**功能上完全一样**（@Service 就是 @Component 的别名，源码里 `@AliasFor`）。
区别只在**语义**：让人一眼看出这是哪一层。

但 `@Repository` **不一样** —— 它额外挂了 `PersistenceExceptionTranslationPostProcessor`，
能把 `SQLException` 翻译成 Spring 的 `DataAccessException` 体系（更统一、更易处理）。
所以持久层一定要用 `@Repository`。
:::

---

## 三、三种注入方式与最佳实践

### ① 字段注入（不推荐）

```java
@Service
public class BookServiceImpl implements BookService {
    @Autowired
    private BookMapper bookMapper;      // ✗ 直接反射赋值
}
```

::: danger 字段注入的五个问题
1. **无法声明 final** → 依赖可被意外置空，不可变性和线程安全无从保证
2. **脱离容器无法实例化** → 单元测试必须启动 Spring 或用反射注入
3. **隐藏依赖过多** → 构造器有 7 个参数你能看出这个类太胖；7 个 @Autowired 字段看不出来
4. **循环依赖被"掩盖"** → 字段注入能解决循环依赖，导致设计问题被藏起来
5. **NPE 风险** → 若容器没注入成功（如自己 new 了对象），运行时才炸
:::

### ② 构造器注入（推荐）

```java
@Service
public class BookServiceImpl implements BookService {
    private final BookMapper bookMapper;
    private final BorrowMapper borrowMapper;

    // Spring 4.3+ 单构造器可省略 @Autowired
    public BookServiceImpl(BookMapper bookMapper, BorrowMapper borrowMapper) {
        this.bookMapper = bookMapper;
        this.borrowMapper = borrowMapper;
    }
}
```

::: key 构造器注入的五个优势
1. **依赖不可变**：`final` 保证注入后不会被改
2. **依赖非空**：对象创建完成时依赖必然就绪
3. **单测友好**：`new BookServiceImpl(mock1, mock2)` 一行搞定
4. **暴露设计问题**：参数超过 5 个，你自己都不好意思
5. **循环依赖立刻暴露**：构造器循环依赖直接启动失败 → 逼你改设计
:::

### ③ setter 注入（可选依赖）

```java
@Service
public class BookServiceImpl {
    private Notifier notifier;      // 可选：没有也能跑

    @Autowired(required = false)
    public void setNotifier(Notifier n) { this.notifier = n; }
}
```

### 多个同类型 Bean 怎么选

```java
// 场景：有两个 BookService 实现
@Service("bookServiceDb")   public class DbBookServiceImpl implements BookService { }
@Service("bookServiceCache") public class CacheBookServiceImpl implements BookService { }
```

```java
// 解法 1：@Primary（默认选它）
@Primary @Service public class DbBookServiceImpl implements BookService { }

// 解法 2：@Qualifier（精确指定）
public BookController(@Qualifier("bookServiceCache") BookService service) { }

// 解法 3：字段名/参数名匹配 Bean 名（Spring 会按名字兜底）
public BookController(BookService bookServiceCache) { }   // 参数名 = bean 名

// 解法 4：@Resource（按名称，JSR-250 标准）
@Resource(name = "bookServiceCache") private BookService service;
```

::: danger 不指定会怎样
```
NoUniqueBeanDefinitionException:
  No qualifying bean of type 'com.bookhub.service.BookService' available:
  expected single matching bean but found 2: bookServiceDb,bookServiceCache
```
Spring 不知道你要哪个 → 启动失败。

**注意**：如果其中一个标了 `@Primary`，就默认用它，不会报错。
:::

### @Autowired vs @Resource

| | @Autowired | @Resource |
|---|---|---|
| 来源 | Spring | JSR-250（Java 标准） |
| 匹配方式 | **先按类型**，多个再按名称 | **先按名称**，找不到再按类型 |
| 可配 required | ✅ `required=false` | ❌ |
| 配合限定符 | `@Qualifier` | `name` 属性 |

---

## 四、Bean 作用域与生命周期

### 六种作用域

| 作用域 | 说明 | 场景 |
|---|---|---|
| `singleton`（默认） | 容器内**唯一实例** | 无状态服务 |
| `prototype` | 每次 `getBean()` 都新建 | 有状态对象 |
| `request` | 每个 HTTP 请求一个 | 请求级上下文 |
| `session` | 每个会话一个 | 用户会话数据 |
| `application` | 每个 ServletContext 一个 | 全局配置 |
| `websocket` | 每个 WS 会话一个 | |

```java
@Service
@Scope("prototype")
public class ReportBuilder { }      // 每次注入都是新对象（因为内部有可变状态）
```

::: danger singleton 里有可变状态 = 线程安全问题
```java
@Service
public class BadService {
    private int counter = 0;           // ✗ 单例 + 可变字段

    public int next() { return ++counter; }   // 并发下数据错乱
}
```
Tomcat 用线程池处理请求，**同一个 Service 实例会被多个线程同时调用**。
所以 Service 必须**无状态**（只持有 final 的、线程安全的依赖）。

**需要"每次新对象"就用 `prototype`；需要"每个用户独立"就用 `request`/`session`。**
:::

### 完整生命周期（十一步）

```
① 实例化（构造器）                    instantiate
② 属性填充（依赖注入）                populateBean
③ BeanNameAware                      setBeanName
④ BeanFactoryAware                   setBeanFactory
⑤ ApplicationContextAware            setApplicationContext
⑥ BeanPostProcessor.postProcessBeforeInitialization
⑦ @PostConstruct                     ← 常用
⑧ InitializingBean.afterPropertiesSet
⑨ 自定义 init-method
⑩ BeanPostProcessor.postProcessAfterInitialization   ← AOP 代理在这里生成
⑪ 使用中
── 容器关闭 ──
⑫ @PreDestroy                        ← 常用
⑬ DisposableBean.destroy
⑭ 自定义 destroy-method
```

```java
@Component
public class LifecycleDemo implements BeanNameAware, InitializingBean, DisposableBean {
    public LifecycleDemo() { System.out.println("1. 构造"); }

    @PostConstruct
    public void postConstruct() { System.out.println("7. @PostConstruct"); }

    @Override public void afterPropertiesSet() { System.out.println("8. afterPropertiesSet"); }

    @PreDestroy
    public void preDestroy() { System.out.println("12. @PreDestroy"); }

    @Override public void destroy() { System.out.println("13. destroy"); }
    @Override public void setBeanName(String n) { System.out.println("3. setBeanName: " + n); }
}
```

::: key 最重要的两个时机
- **`@PostConstruct`**：依赖已注入、对象可用 → 做初始化（加载缓存、建连接）
- **`@PreDestroy`**：容器关闭前 → 做清理（关线程池、刷盘）

AOP 代理在 `⑩ postProcessAfterInitialization` 生成。
这也解释了为什么 `@Transactional` 在 `@PostConstruct` 里调用不生效 —— 那时代理还没生成。
:::

::: warn @PostConstruct 在 JDK 11+ 需要额外依赖
JDK 11 起 `javax.annotation` 从 JDK 移除。Spring Boot 3（Jakarta EE 9+）
的 `@PostConstruct` 在 `jakarta.annotation-api` 里，`spring-boot-starter-web` 已包含。
如果手动最小依赖，需要自己加。
:::

---

## 五、@Configuration 与 @Bean

### 基本用法

```java
@Configuration
public class MybatisConfig {

    @Bean
    public SqlSessionFactory sqlSessionFactory(DataSource ds) throws Exception {
        SqlSessionFactoryBean f = new SqlSessionFactoryBean();
        f.setDataSource(ds);
        f.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/*.xml"));
        // 驼峰映射
        org.apache.ibatis.session.Configuration c = new org.apache.ibatis.session.Configuration();
        c.setMapUnderscoreToCamelCase(true);
        f.setConfiguration(c);
        return f.getObject();
    }

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }
}
```

::: key 为什么 @Configuration 类必须用代理（CGLIB）
```java
@Configuration
public class AppConfig {
    @Bean public A a() { return new A(b()); }     // 调用了 b()
    @Bean public B b() { return new B(); }
}
```
如果 `@Configuration` 不加代理，`b()` 就是**普通方法调用**，
`new A(b())` 里的 `b()` 会**新建一个 B 实例**，而不是从容器拿 → 两个 B 对象！

Spring 给 `@Configuration` 类生成 CGLIB 子类，拦截 `@Bean` 方法：
第一次调用创建对象并放入容器，后续调用**直接返回容器里的那个**。

:::danger 对比 @Component + @Bean（"lite"模式）
```java
@Component                       // ← 不是 @Configuration
public class LiteConfig {
    @Bean public A a() { return new A(b()); }   // ✗ 每次都是新 B
    @Bean public B b() { return new B(); }
}
```
`@Component` 不生成代理，`@Bean` 方法互相调用会创建多个实例。
:::
:::

### @Bean 的常用属性

```java
@Bean(
    name = {"myMapper", "mapperAlias"},   // 多个名字
    initMethod = "init",                  // 等价于 init-method
    destroyMethod = "close",              // 等价于 destroy-method
    autowire = Autowire.BY_TYPE           // 少见
)
public MyMapper myMapper() { }
```

::: tip @Bean 方法名就是 Bean 名
```java
@Bean
public BookService bookService() { }    // Bean 名 = "bookService"

@Bean
public BookService myService() { }      // Bean 名 = "myService"
```
`@Qualifier("myService")` 匹配的就是方法名。
:::

---

## 六、循环依赖与三级缓存

### 什么是循环依赖

```java
@Service
public class AService {
    @Autowired private BService b;      // A 依赖 B
}

@Service
public class BService {
    @Autowired private AService a;      // B 依赖 A
}
```

::: danger 构造器注入的循环依赖 —— 无解
```java
@Service
public class AService {
    public AService(BService b) { }     // 创建 A 必须先把 B 造出来
}
@Service
public class BService {
    public BService(AService a) { }     // 创建 B 必须先把 A 造出来
}
```
**启动直接失败**：
```
BeanCurrentlyInCreationException: Error creating bean with name 'aService':
  Requested bean is currently in creation: Is there an unresolvable circular reference?
```

这不是 Spring 的缺陷，是**设计问题**。
**这正是构造器注入的优点：它逼你在启动时就面对循环依赖，而不是让它在运行时埋雷。**
:::

### 三级缓存如何解决字段注入的循环依赖

```java
// 三级缓存（都在 DefaultSingletonBeanRegistry 里）
Map<String, Object> singletonObjects        = new ConcurrentHashMap<>(256);  // ① 一级：成品
Map<String, Object> earlySingletonObjects   = new ConcurrentHashMap<>(16);   // ② 二级：半成品（早期引用）
Map<String, ObjectFactory<?>> singletonFactories = new HashMap<>(16);       // ③ 三级：工厂（能生成早期引用）
```

::: key 创建 A 时的完整流程
```
getBean("aService")
  ↓
① 实例化 A（构造器，此时 b 字段是 null）→ 得到一个"裸对象"
  ↓
② 把 A 的 ObjectFactory 放入三级缓存
   singletonFactories.put("aService", () -> getEarlyBeanReference(A))
  ↓
③ 填充属性：发现需要 B → getBean("bService")
  ↓
④ 创建 B：实例化 B → 填充属性时发现需要 A
  ↓
⑤ 从缓存找 A：
   一级没有 → 二级没有 → 三级有！
   调工厂 → 得到 A 的早期引用（可能是代理对象）
   放入二级缓存，从三级移除
  ↓
⑥ B 拿到 A 的早期引用，B 创建完成 → 放入一级缓存
  ↓
⑦ 回到 A，B 注入成功，A 创建完成 → 从二级/三级移除，放入一级
```

**最终：A 和 B 互相持有对方的引用，都是完整对象。**
:::

::: danger 为什么必须三级，两级不行？
关键在于**代理对象**。

如果 A 需要被 AOP 代理（比如有 `@Transactional`），
B 注入的必须是**代理对象**，而不是原始对象 —— 否则事务不生效。

- 只有两级（一级 + 二级）：早期引用放二级，但那时还没生成代理 → B 拿到原始对象 → 事务失效
- 三级缓存存的是 **ObjectFactory**：调用它时才决定"要不要提前生成代理"，
  通过 `getEarlyBeanReference()` 里的 `SmartInstantiationAwareBeanPostProcessor` 判断

**三级缓存的核心价值：延迟决定是否要提前暴露代理对象。**
:::

### 解决循环依赖的四种方案

```java
// ① 改设计（最优）：抽第三个类，消除双向依赖
// A → C，B → C，而不是 A ↔ B

// ② @Lazy：注入代理，延迟到真正使用时才解析
@Service
public class AService {
    @Autowired @Lazy private BService b;
}

// ③ setter 注入（Spring 能处理）
@Service
public class AService {
    private BService b;
    @Autowired public void setB(BService b) { this.b = b; }
}

// ④ @DependsOn（指定初始化顺序，治标不治本）
```

::: warn Spring Boot 2.6+ 默认禁止循环依赖
```yaml
spring:
  main:
    allow-circular-references: true    # 默认 false，需要显式开启
```
Spring Boot 2.6 起，循环依赖会导致启动失败（除非显式允许）。
这个变更的意图很明确：**逼你修设计，而不是依赖框架的兜底机制。**
:::

---

## 七、条件装配

### 常用条件注解

```java
@Configuration
public class FeatureConfig {

    /** 只有配置了 app.cache.enabled=true 才生效 */
    @Bean
    @ConditionalOnProperty(name = "app.cache.enabled", havingValue = "true")
    public CacheService cacheService() { return new RedisCacheService(); }

    /** 只有 classpath 有 Redis 类才生效 */
    @Bean
    @ConditionalOnClass(name = "redis.clients.jedis.Jedis")
    public RedisTemplate redisTemplate() { }

    /** 只有用户没定义自己的 Bean 才生效（默认实现） */
    @Bean
    @ConditionalOnMissingBean(CacheService.class)
    public CacheService noopCacheService() { return new NoopCacheService(); }

    /** 环境是 prod 才生效 */
    @Bean
    @Profile("prod")
    public AlertService alertService() { }
}
```

### 自定义条件

```java
public class OnWindowsCondition implements Condition {
    @Override
    public boolean matches(ConditionContext ctx, AnnotatedTypeMetadata meta) {
        return System.getProperty("os.name").toLowerCase().contains("win");
    }
}

@Configuration
public class OsConfig {
    @Bean
    @Conditional(OnWindowsCondition.class)
    public PathResolver windowsPathResolver() { return new WindowsPathResolver(); }
}
```

::: key 这就是 Spring Boot 自动配置的底层机制
```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)
@ConditionalOnMissingBean(DataSource.class)
@ConditionalOnProperty("spring.datasource.url")
public class DataSourceAutoConfiguration {
    @Bean
    public DataSource dataSource(...) { }
}
```
**三个条件**：有 DataSource 类（说明引入了 JDBC）、用户没自定义、配置了 url。
全满足才生效 → 所以你"只写配置就能用"。
:::

---

## 八、本节速查

```java
// 三种注册
@Component/@Service/@Repository/@Controller（扫包）
@Configuration + @Bean（第三方类）
registerSingleton（动态）

// 三种注入（按推荐度）
① 构造注入（推荐）：final + 单构造器免 @Autowired
② setter（可选依赖）：@Autowired(required=false)
③ 字段注入（不推荐）：无法 final、测试难、掩盖设计问题

// 多实现选择
@Primary（默认）/ @Qualifier("name") / 参数名匹配 / @Resource(name=)

// 作用域
singleton（默认，必须无状态）/ prototype / request / session

// 生命周期
构造 → 属性填充 → Aware → BeanPostProcessor.before → @PostConstruct
        → afterPropertiesSet → init-method → BeanPostProcessor.after（生成代理）
→ 使用 → @PreDestroy → destroy → destroy-method

// 循环依赖
构造器：无解（启动失败，这是好事）
字段/setter：三级缓存解决
  singletonObjects / earlySingletonObjects / singletonFactories
三级的意义：延迟决定是否提前生成 AOP 代理

// 条件装配
@ConditionalOnClass / @ConditionalOnMissingBean / @ConditionalOnProperty / @Profile
```

::: interview 面试高频
**Q：什么是 IOC？什么是 DI？两者什么关系？**
A：IOC 是控制反转 —— 对象的创建和依赖装配的控制权从业务代码反转给容器。
DI 是依赖注入 —— IOC 的实现手段，容器把依赖推给对象。
IOC 是思想，DI 是实现。

**Q：为什么推荐构造器注入？**
A：① 依赖可声明为 final，不可变且非空；② 单元测试可直接 new 传入 mock；
③ 依赖数量暴露设计问题；④ 循环依赖在启动时就暴露，而不是运行时。

**Q：Spring 如何解决循环依赖？为什么需要三级缓存？**
A：字段/setter 注入通过三级缓存解决：创建 A 时把 A 的 ObjectFactory 放三级缓存，
B 需要 A 时从三级缓存拿到 A 的早期引用。
三级缓存的意义在于 **ObjectFactory 能延迟决定是否提前生成 AOP 代理**，
如果只有两级，B 注入的就可能是未代理的原始对象，导致事务等 AOP 功能失效。
构造器注入的循环依赖无法解决。

**Q：@Configuration 和 @Component 里的 @Bean 有什么区别？**
A：@Configuration 会被 CGLIB 代理，@Bean 方法互相调用时返回容器中的同一实例；
@Component 不代理，@Bean 方法调用就是普通方法调用，会创建多个实例。

**Q：@Autowired 和 @Resource 的区别？**
A：@Autowired 是 Spring 的，按类型匹配（多个时再按名称），可配 required=false；
@Resource 是 JSR-250 标准，默认按名称匹配，找不到再按类型，不支持 required。

**Q：单例 Bean 线程安全吗？**
A：不是。Spring 不保证单例 Bean 的线程安全，需要你自己保证无状态（只用 final 的、
线程安全的依赖）。有可变状态就用 prototype 或让状态局部化。
:::

---

## 延伸练习

1. 手写一个 30 行 IoC 容器：扫描指定包 → 找带注解的类 → 反射实例化 → 按类型注入字段。
   （这个练习比看十遍原理都管用，见 `labs/ioc/`）
2. 把项目里所有 `@Autowired` 字段注入改成构造器注入，体会代码变化。
3. 造一个真实的循环依赖（A 字段注入 B，B 字段注入 A），观察启动是否报错，
   再改成构造器注入，观察报错信息。
4. 写一个 `@Conditional` 实现"只在 Windows 上生效的 Bean"。
5. 写一个 Bean，在 `@PostConstruct` 里启动定时任务，`@PreDestroy` 里优雅关闭，
   观察容器关闭时日志顺序。
6. 用 `@Primary` 和 `@Qualifier` 各实现一次"两个同类型 Bean 的选择"。

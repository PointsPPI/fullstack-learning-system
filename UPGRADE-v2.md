# 系统升级说明 v2.0

> 本次升级加了四块能力：**Redis 全家桶**、**在线代码运行**、**自动判题**、**性能护栏判题**。
> 全部经过真实环境实测，不是"写完就交"。

---

## 一、Redis：缓存 / 分布式锁 / 限流 / 幂等

### 1.1 四项能力的分工

| 能力 | 解决什么问题 | 代码位置 | 实测结果 |
|---|---|---|---|
| **缓存** | 重复查询打数据库 | `BookServiceImpl.detail` + `CacheConfig` | 118ms → 23ms → **8ms** |
| **分布式锁** | 多人同时抢同一本书 | `RedisLock` + `BorrowServiceImpl` | 10 并发只成功 1 个 |
| **限流** | 有人疯狂刷接口 | `@RateLimit` + `RateLimitAspect` | 60 秒 20 次上限 |
| **幂等** | 用户双击重复提交 | `@Idempotent` + `IdempotentAspect` | 3 秒内重复 → `10502` |

### 1.2 三层库存防护（这是最值得看的设计）

```
请求 → ① Redis 库存预检（无锁，最快）
      → ② 分布式锁（按 bookId 串行化）
      → ③ 数据库原子更新 WHERE stock > 0（最终防线）
```

**为什么三层都要有？**

| 只保留 | 后果 |
|---|---|
| 只有第 ③ 层 | 热点行锁排队，数据库被打爆 |
| 只有 ②③ | 冲突请求全都要抢锁，浪费 Redis 往返 |
| 只有 ①② | Redis 计数与真实库存可能不一致（Redis 不是权威） |

**核心原则：Redis 是加速器，数据库是权威源。**

### 1.3 缓存一致性：必须在 afterCommit 刷新

```java
// ✗ 错误的做法：事务里就刷缓存
redis.set(key, newValue);   // 事务若回滚 → 缓存成了脏数据
                            // 并发时其他线程还会读到"未提交"的值

// ✓ 正确做法：注册事务回调
TransactionSynchronizationManager.registerSynchronization(
    new TransactionSynchronization() {
        @Override public void afterCommit() { refreshCache(); }
    });
```

### 1.4 踩过的坑：record 不能 JDK 序列化

```
SerializationException: Cannot serialize
    at JdkSerializationRedisSerializer.serialize
```

**原因**：Spring Boot 默认用 JDK 序列化，要求对象 `implements Serializable`。
本项目的 VO 是 `record` —— record 是隐式 final，**不会自动实现 Serializable**。

**解决**：换成 JSON 序列化（`GenericJackson2JsonRedisSerializer`）。

**但还有第二个坑**：`activateDefaultTyping` 用 `NON_FINAL` 时，
写入用普通对象格式、读取却期望 `["类名", {...}]` 数组格式 →
报 `expected START_ARRAY: need Array value to contain As.WRAPPER_ARRAY`。

**必须用 `EVERYTHING` + `WRAPPER_ARRAY`**，保证读写两侧格式一致。

### 1.5 幂等 vs 业务异常：一个反直觉的决策

```java
catch (BizException e) {
    // ★ 业务异常：不释放幂等占位
    throw e;
} catch (Throwable e) {
    // ★ 系统异常：释放占位
    redis.delete(key);
    throw e;
}
```

**为什么业务失败不释放？**
这是实测发现的真实问题：如果 `"借阅已达上限"` 时释放占位，
用户 3 秒内重复点击会一路打进数据库（每次都做一遍校验），幂等形同虚设。

**为什么系统异常要释放？**
数据库刚挂了不是用户的错，不该把用户锁 3 秒不让重试。

### 1.6 切面顺序用 @Order 显式固定

```java
@Order(1) RateLimitAspect      // 最便宜：一次 INCR
@Order(2) IdempotentAspect     // 中等：要算参数哈希
// 最内层：分布式锁（在 Service 里）
```

原则：**便宜的检查放外层，不通过就不做贵的检查**（fail fast & cheap first）。

实测验证：5 次相同请求 → `[30004, 10502, 10502, 10502, 10502]`，
限流计数器 = 5（全部计入），证明限流确实在幂等之前。

---

## 二、在线代码运行（沙箱）

### 2.1 能力

- 浏览器里写 Java → 点运行 → 立刻看到输出
- 独立进程执行，带超时强杀、输出上限、内存限制
- 编译错误 / 运行错误 / 超时 三种状态分开呈现

### 2.2 为什么用独立进程而不是进程内编译

| 方案 | 问题 |
|---|---|
| `javax.tools.JavaCompiler` | 用户代码让编译器 OOM → **整个后端进程挂掉** |
| JShell | 不产生 class 文件，看不到编译错误位置 |
| **独立进程 javac + java** ← 采用 | 可超时强杀、崩溃不影响主进程 |

**关键**：`Thread.stop()` 已废弃，无法安全中断一个死循环线程。
只有杀进程是唯一可靠手段。

### 2.3 踩过的坑：stdin 管道死锁（最隐蔽的一个）

**现象**：`waitFor(5000ms)` 只等了 **115ms** 就返回 `true`，
看起来"程序跑得飞快"，实际是**根本没跑**。

**原因**：
```
管道缓冲区只有 64KB
性能用例的 stdin 有 2MB
  → 主线程 os.write() 阻塞
  → 子进程只读到 64KB 就遇到 EOF，提前退出
  → waitFor 立刻返回
```

**解决**：stdin 写入放到独立线程，分块（32KB）写，主线程继续读 stdout。

这条修复直接决定了性能护栏能不能工作 —— 修之前线性扫描"11327ms 却 PASS"，
修之后立刻变成"5609ms 超时被拦截"。

### 2.4 安全边界（诚实说明）

**已防**：独立临时目录、超时强杀、输出截断、`-Xmx` 限内存、无 stdin 阻塞、代码长度限制。

**未防**：恶意代码（`System.exit`、`Runtime.exec`、文件写、网络、反射）。
要防这些需要容器隔离 + seccomp + 只读根文件系统。

**本项目定位是本地学习工具，不是生产级多租户判题服务。**

---

## 三、自动判题

### 3.1 判题机制：harness 注入

学习者只写方法，评测机自动包成可运行程序：

```java
import java.util.*;
public class Main {
    // ═══ 用户代码 ═══
    public static int add(int a, int b) { return a + b; }

    // ═══ 骨架提供的测试驱动 ═══
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(add(sc.nextInt(), sc.nextInt()));
    }
}
```

好处：学习者专注算法，不用每次写 Scanner。
代价：无法出"从 stdin 读数据"这类题（所以引擎也支持 FULL 模式）。

### 3.2 题库（7 道）

| 题目 | 难度 | 考点 | 用例数 |
|---|---|---|---|
| 两数之和 | 入门 | 方法/参数/返回值 | 5 |
| 计算阶乘 | 入门 | 循环、`long` 溢出 | 5 |
| 斐波那契 | 简单 | **递归 vs 迭代的性能差** | 5 |
| 数组求和与最大值 | 入门 | 数组遍历 | 5 |
| 字符串反转 | 入门 | StringBuilder | 5 |
| 二分查找 | 中等 | **边界 + O(log n)** | 9 |
| 去重并排序 | 简单 | TreeSet | 5 |

### 3.3 用例设计的三条原则

1. **必须覆盖边界**，不能只测正常值
   - `add(1,2)==3` 无效 —— 写 `return 3` 就能骗过
   - 必须有：0、负数、大数、空集合

2. **隐藏用例必须与示例不同**
   - 示例 1 个（给人调试），其余隐藏（真正判分）
   - 实测：硬编码 `return 3` → 示例过、隐藏错 → **1/5 = 20 分**

3. **性能题要能区分复杂度**
   - 见下节

### 3.4 性能护栏：标定过程（这部分最有价值）

**目标**：让 O(n) 的线性扫描无法通过二分查找题。

**三次失败**：

| 尝试 | 规模 | 阈值 | 结果 |
|---|---|---|---|
| ① | 50万数组 × 1次查询 | 5000ms | 线性只花几毫秒 → **通过** ✗ |
| ② | 20万查询 × 20万元素 | 3000ms | 二分1019ms / 线性5346ms，窗口太窄 ✗ |
| ③ | 10万 × 10万 | 2500ms | 二分1069ms / 线性2063ms，只差2倍 ✗ |
| **④** | **30万 × 30万** | **5000ms** | **二分1338ms / 线性11353ms，8.5倍** ✓ |

**教训**：
- 单次查询时 O(n) 的常数本身就小（50万次数组访问只要 1~2ms）
- 要放大的是「规模 × 查询次数」，不是只放大规模
- 阈值窗口要够宽（8.5 倍），否则慢机器上会误杀正确解法

**最终结果**：
```
线性扫描 → 性能用例 5609ms → TIMEOUT → 8/9 不通过 ✓
二分查找 → 性能用例 1019ms → PASS    → 9/9 满分   ✓
```

**诚实的局限**：时间阈值判题天然受机器性能影响。
工业界用「限制指令数（JVM 插桩）」或「相对标准解法的耗时倍数」。
本项目取「宽窗口 + 大倍数」，宁可放过个别优化过的线性实现，也不误杀正确解法。

### 3.5 输出归一化

```java
// 判题前统一处理
"6"  /  "6 "  /  "6\n\n"  →  全部归一为 "6"
```

不做的事：不去行内空格、不转大小写 —— 那些是题目自己的规则。

### 3.6 实测：14 项判定全部正确

```
两数之和      错误→20分  正确→100分  ✓
计算阶乘      错误→20分  正确→100分  ✓
斐波那契      错误→40分  正确→100分  ✓
数组求和      错误→20分  正确→100分  ✓
字符串反转    错误→60分  正确→100分  ✓
二分查找      错误→TIMEOUT 正确→100分 ✓  ← 性能护栏生效
去重并排序    错误→40分  正确→100分  ✓
```

---

## 四、前端

### 4.1 自研编辑器（零依赖，200 行）

**为什么不用 CodeMirror / Monaco？**
- Monaco 约 5MB、CodeMirror 约 300KB —— 与「双击 index.html 可用」冲突
- 我们只需要：行号、等宽字体、Tab 缩进、括号配对、注释切换

**实现要点**：
- `<textarea>` 接收输入（原生撤销栈、输入法、选区）
- `<div>` 渲染行号，与 textarea 同步滚动
- 回车保持缩进，遇 `{` 自动 +4；自动配对 `([{"`
- `Ctrl+Enter` 运行，`Ctrl+/` 注释，`Tab`/`Shift+Tab` 缩进

### 4.2 判题结果可视化

失败用例默认展开，直接显示**输入 / 期望 / 实际**三行对比 ——
学习者不需要猜"错在哪"。

---

## 五、启动方式

```bash
# 1. 启动 Redis（新增）
cd tools/redis && redis-server.exe --port 6380

# 2. 启动 MySQL
tools\db-up.bat

# 3. 启动后端
cd project/bookhub && mvnw.cmd spring-boot:run

# 4. 启动静态服务
node tools/serve.mjs
```

或直接双击 `一键启动.bat`（会自动拉起 Redis）。

访问 `http://127.0.0.1:5173/learning-system/#/practice` 开始用。

---

## 六、验证命令

```bash
node tools/verify.mjs              # 8 项完整性验收
node tools/test-kernel.mjs         # 43 项内核断言
node tools/test-judge-all.mjs      # 14 项判题判定（7 题 × 2）
node tools/test-perf.mjs           # 性能护栏标定
node tools/test-order.mjs          # 切面执行顺序
node tools/test-timing.mjs         # 超时机制验证
```

后端测试：`cd project/bookhub && mvnw.cmd test`（21 个）

# HTTP 协议

::: key 一句话抓住本质
HTTP 是**"请求-响应"式的无状态文本协议**。
理解它 = 理解四件事：**报文长什么样、状态码说什么、谁记住我是谁、怎么省流量**。
:::

## 学习点

| # | 知识点 | 面试出现率 |
|---|---|---|
| 1 | 报文结构与 Header | ★★★★ |
| 2 | 方法与幂等性 | ★★★★★ |
| 3 | 状态码全解 | ★★★★★ |
| 4 | 强缓存与协商缓存 | ★★★★★ |
| 5 | Cookie 与 Session | ★★★★ |
| 6 | HTTPS 与 TLS | ★★★★ |
| 7 | HTTP 版本演进 | ★★★ |
| 8 | RESTful 设计 | ★★★★ |

---

## 一、报文结构与 Header

### 请求报文

```http
POST /api/books?draft=1 HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Content-Length: 42
Authorization: Bearer eyJhbGci...
Accept: application/json
User-Agent: Mozilla/5.0 ...
Cookie: sessionId=abc123

{"title":"Java 核心技术","price":149}
```

结构：
```
请求行：方法 路径?查询 协议版本
请求头：Key: Value（每行一个）
空行
请求体（可选，GET 通常没有）
```

### 响应报文

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 128
Cache-Control: max-age=3600
ETag: "abc123"
Set-Cookie: sessionId=xyz; HttpOnly; Path=/
Date: Sat, 25 Oct 2026 15:00:00 GMT

{"code":0,"message":"ok","data":{"id":1}}
```

### 关键 Header 速查

::: key 必须记住的一批
**内容协商**
- `Content-Type`：body 是什么格式（`application/json`、`text/html; charset=utf-8`）
- `Content-Length`：body 字节数
- `Accept`：我期望的响应格式
- `Accept-Encoding` / `Content-Encoding`：压缩（gzip/br）

**缓存**
- `Cache-Control`：`max-age=3600`、`no-cache`、`no-store`
- `ETag` / `If-None-Match`：内容指纹
- `Last-Modified` / `If-Modified-Since`：修改时间

**认证**
- `Authorization`：`Bearer <token>`
- `Cookie` / `Set-Cookie`

**其他常用**
- `Host`：目标主机（HTTP/1.1 必需，否则 400）
- `User-Agent`：客户端标识
- `Referer`：从哪个页面跳来的（防盗链）
- `Origin`：跨域请求的来源（CORS 用）
- `X-Forwarded-For` / `X-Real-IP`：代理后取真实 IP
:::

::: danger Content-Length vs Transfer-Encoding
两个都是告诉对方"body 有多长"，但**不能同时用**。

```http
Content-Length: 1024          ← 明确长度
Transfer-Encoding: chunked    ← 分块传输，长度未知（流式响应）
```
同时出现会导致某些代理/服务器行为异常（甚至请求走私漏洞）。
Spring Boot 流式返回时用 chunked，正常 JSON 返回用 Content-Length。
:::

---

## 二、方法与幂等性

### 九个方法

| 方法 | 用途 | 安全 | 幂等 | 有 body |
|---|---|---|---|---|
| `GET` | 查询资源 | ✅ | ✅ | ❌（不应有） |
| `HEAD` | 只要响应头 | ✅ | ✅ | ❌ |
| `OPTIONS` | 查询支持的方法 / CORS 预检 | ✅ | ✅ | ❌ |
| `POST` | 创建资源 / 提交数据 | ❌ | ❌ | ✅ |
| `PUT` | **全量替换**资源 | ❌ | ✅ | ✅ |
| `PATCH` | **部分更新**资源 | ❌ | ❌（通常） | ✅ |
| `DELETE` | 删除资源 | ❌ | ✅ | 可 |
| `TRACE` | 回显请求（调试） | ✅ | ✅ | ❌ |
| `CONNECT` | 建立隧道（代理） | ❌ | ❌ | ❌ |

::: key 安全 vs 幂等，是两个不同概念
- **安全（safe）**：不改变服务端状态。GET/HEAD/OPTIONS 是安全的。
- **幂等（idempotent）**：执行 1 次和执行 N 次，**服务端状态相同**。

`DELETE /books/1` 是幂等的：删一次和删十次，结果都是"书 1 不存在"（虽然第二次返回 404）。
`POST /books` 不幂等：发两次就创建了两本书。
:::

::: warn 为什么幂等这么重要
**网络超时重试**时会暴露问题。

```java
// 客户端：超时了，重试
POST /api/orders {"bookId":1}   → 超时
POST /api/orders {"bookId":1}   → 成功，但下了 2 单
```

**解法：幂等键**
```http
POST /api/orders
Idempotency-Key: 7f3a-4b2c-...
```
服务端记录这个 key，重复请求直接返回上次的结果。
支付宝/微信支付的 `out_trade_no` 就是这个思路。
:::

### RESTful 语义与常见错误

```
GET    /api/books          列表
GET    /api/books/1        详情
POST   /api/books          新增
PUT    /api/books/1        全量更新
PATCH  /api/books/1        部分更新
DELETE /api/books/1        删除
GET    /api/books/1/borrows  子资源
```

::: danger 五个常见错误
```http
✗ GET  /api/getBookList         ← 动词不该出现在 URL
✓ GET  /api/books

✗ GET  /api/books/delete?id=1   ← 用 GET 做删除（爬虫/prefetch 会误删！）
✓ DELETE /api/books/1

✗ POST /api/books/1/update      ← 动词冗余
✓ PUT  /api/books/1

✗ POST /api/books/1?method=delete
✓ DELETE /api/books/1

✗ PUT /api/books/1  但只传了 title   ← PUT 是"全量替换"，只传一个字段会导致其他字段被清空
✓ PATCH /api/books/1  只传 title
```
:::

::: tip 什么时候可以不遵守 REST
REST 不是法律。以下几种情况用"动作式端点"更自然：

```http
POST /api/books/1/borrow        借书（动作）
POST /api/books/1/return        还书
POST /api/orders/1/pay          支付
POST /api/auth/login            登录
```
这些是"业务动作"而不是"资源操作"，用动词完全合理。
:::

---

## 三、状态码全解

### 五位分类

| 段 | 含义 |
|---|---|
| **1xx** | 信息，请求已收到，继续处理 |
| **2xx** | 成功 |
| **3xx** | 重定向，需要进一步操作 |
| **4xx** | 客户端错误（你错了） |
| **5xx** | 服务端错误（我错了） |

### 2xx

| 码 | 含义 | 用途 |
|---|---|---|
| `200 OK` | 成功 | 最常用 |
| `201 Created` | 已创建 | POST 新增成功，配合 `Location` 头 |
| `204 No Content` | 成功但无返回体 | DELETE 成功 |
| `206 Partial Content` | 部分内容 | 断点续传、视频分片 |

### 3xx

| 码 | 含义 | 关键区别 |
|---|---|---|
| `301 Moved Permanently` | 永久重定向 | **会被浏览器缓存**，改回来很麻烦 |
| `302 Found` | 临时重定向 | 不缓存，但可能把 POST 变 GET |
| `303 See Other` | 临时，强制用 GET | 明确让客户端改用 GET |
| `307 Temporary Redirect` | 临时，**保持原方法** | POST 还是 POST |
| `308 Permanent Redirect` | 永久，保持原方法 | |
| `304 Not Modified` | 未修改 | 协商缓存命中，用本地缓存 |

::: danger 301 的经典事故
上线时把 `http://a.com` 301 到 `https://b.com`，
后来想改回去 —— 用户的浏览器**根本不会再来问服务器**，它直接跳 b.com。
**301 是永久的，测试环境千万别用 301 做临时跳转。**
:::

### 4xx（客户端错误）

| 码 | 含义 | 典型场景 |
|---|---|---|
| `400 Bad Request` | 请求格式错误 | JSON 语法错、参数类型不对 |
| `401 Unauthorized` | **未认证**（没登录/凭证无效） | token 过期 |
| `403 Forbidden` | **已认证但无权限** | 普通用户访问管理接口 |
| `404 Not Found` | 资源不存在 | |
| `405 Method Not Allowed` | 方法不支持 | 用 GET 请求 POST 接口，响应带 `Allow` 头 |
| `406 Not Acceptable` | 无法满足 Accept | 只支持 JSON，客户端要 XML |
| `408 Request Timeout` | 请求超时 | |
| `409 Conflict` | 冲突 | 重复创建、乐观锁版本冲突 |
| `410 Gone` | 资源永久消失 | 比 404 更明确 |
| `413 Payload Too Large` | body 太大 | 上传超限 |
| `415 Unsupported Media Type` | Content-Type 不支持 | 发 `text/plain` 但接口要 JSON |
| `422 Unprocessable Entity` | 格式对但语义错 | 校验失败（很多 API 用它代替 400） |
| `429 Too Many Requests` | 请求过多 | 限流，配合 `Retry-After` |

::: key 401 vs 403 —— 高频面试题
- **401 Unauthorized**：你是谁？我不知道。→ 去登录。
- **403 Forbidden**：我知道你是谁，但你不能做这个。→ 别试了，找管理员。

401 的响应通常带 `WWW-Authenticate: Bearer` 头。
:::

### 5xx（服务端错误）

| 码 | 含义 |
|---|---|
| `500 Internal Server Error` | 未预期的服务端错误（兜底） |
| `501 Not Implemented` | 方法未实现 |
| `502 Bad Gateway` | 网关收到上游的无效响应（后端挂了） |
| `503 Service Unavailable` | 服务暂不可用（过载/维护），配合 `Retry-After` |
| `504 Gateway Timeout` | 网关等上游超时 |

::: tip 502 / 503 / 504 怎么区分
- **502**：Nginx 连上了后端，但后端返回了垃圾/断开连接 → **后端崩了**
- **503**：后端明确说"我现在不服务" → **主动拒绝**（限流、维护）
- **504**：Nginx 等后端响应超时 → **后端太慢**

这三个是最常见的"线上事故"状态码。
:::

---

## 四、强缓存与协商缓存

::: key 两种缓存的分工
- **强缓存**：浏览器**根本不发请求**，直接用本地缓存。看 `Cache-Control` / `Expires`
- **协商缓存**：浏览器**发请求问"变了吗"**，没变则返回 304（只回头，不回 body）。看 `ETag` / `Last-Modified`
:::

### 强缓存

```http
Cache-Control: max-age=3600        ← 3600 秒内直接用本地缓存
Cache-Control: no-cache            ← 可以缓存，但每次必须先问服务器（走协商）
Cache-Control: no-store            ← 完全不缓存（敏感数据）
Cache-Control: public              ← 任何缓存（包括 CDN）都能存
Cache-Control: private             ← 只有浏览器能存，CDN 不能
Cache-Control: immutable           ← 内容永不变化（配合带 hash 的文件名）
```

::: warn no-cache 不是"不缓存"
这是最容易搞混的点：
- `no-cache`：**可以存**，但每次使用前必须向服务器验证（走协商缓存）
- `no-store`：**完全不许存**

真正"完全不缓存"是 `no-store`。
:::

### 协商缓存

两种配对：

**① ETag / If-None-Match（内容指纹，推荐）**

```http
# 第一次响应
HTTP/1.1 200 OK
ETag: "abc123def"

# 第二次请求
GET /api/books
If-None-Match: "abc123def"

# 服务器对比：没变
HTTP/1.1 304 Not Modified
```

**② Last-Modified / If-Modified-Since（时间戳）**

```http
# 第一次响应
Last-Modified: Sat, 25 Oct 2026 10:00:00 GMT

# 第二次请求
If-Modified-Since: Sat, 25 Oct 2026 10:00:00 GMT

# 没变
HTTP/1.1 304 Not Modified
```

::: compare ETag vs Last-Modified
| | ETag | Last-Modified |
|---|---|---|
| 精度 | 秒级以下（内容哈希） | **秒级**（1 秒内多次修改无法区分） |
| 可靠性 | 高 | 文件时间变了但内容没变时会误判 |
| 计算成本 | 需要算哈希 | 无 |
| 优先级 | **更高**（两个都有时优先用 ETag） | 低 |
:::

### 完整缓存决策流程

```
请求资源
  ↓
有强缓存且未过期？
  ├── 是 → 直接用本地缓存（状态 200 from cache，甚至不发请求）
  └── 否 ↓
发请求（带 If-None-Match / If-Modified-Since）
  ↓
服务器判断内容是否变化
  ├── 未变 → 304 Not Modified（响应体为空，超省流量）
  └── 已变 → 200 + 新内容 + 新 ETag
```

::: tip 生产环境的缓存策略（最佳实践）
```nginx
# 1. 带 hash 的静态资源：永久强缓存
location ~* \.(js|css|png|jpg|woff2)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# 2. HTML：不缓存（否则用户永远拿不到新版本）
location ~* \.html$ {
    add_header Cache-Control "no-cache";
}

# 3. API：不缓存或短缓存
location /api/ {
    add_header Cache-Control "no-store";
}
```
**核心思路**：文件名带内容 hash，内容变了文件名就变，所以可以永久缓存。
HTML 不带 hash，所以必须每次验证。
:::

---

## 五、Cookie 与 Session

### Cookie 的完整生命周期

```http
# ① 服务端下发
HTTP/1.1 200 OK
Set-Cookie: sessionId=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400

# ② 浏览器自动携带（同域、未过期、符合 Path/SameSite）
GET /api/books
Cookie: sessionId=abc123
```

### Session 的工作方式

```
1. 用户登录 → 服务端创建 session（内存/Redis），生成 sessionId
2. 服务端 Set-Cookie: sessionId=xxx
3. 后续请求自动带 Cookie
4. 服务端用 sessionId 查 session 数据 → 知道是谁
```

::: danger Session 的三个问题
1. **内存泄漏**：session 存内存，用户不注销就一直占着
2. **无法水平扩展**：两台服务器各自有 session，用户轮到另一台就"掉线"
3. **CSRF 风险**：Cookie 自动携带，恶意站点能借用你的登录态

**解法**：Session 存 Redis（共享），或改用 JWT（无状态）。
:::

### 通过 Cookie 属性解决安全问题

| 问题 | 属性 | 原理 |
|---|---|---|
| XSS 窃取 Cookie | `HttpOnly` | JS 的 `document.cookie` 读不到 |
| 明文传输 | `Secure` | 只在 HTTPS 发送 |
| CSRF | `SameSite=Strict/Lax` | 跨站请求不发送 |
| 域名污染 | `Domain` / `Path` | 限制作用范围 |

::: warn XSS 和 CSRF 是两种完全不同的攻击
- **XSS**：攻击者往你的页面注入 JS，**偷你的数据**（Cookie、localStorage）
  → 防：输出转义、CSP、HttpOnly
- **CSRF**：攻击者诱导你在**已登录状态**下向你的站点发请求，**借用你的权限**
  → 防：SameSite、CSRF Token、校验 Origin/Referer

一个偷，一个骗。防御手段完全不同。
:::

---

## 六、HTTPS 与 TLS 握手

### 为什么需要 HTTPS

HTTP 明文传输的三个致命问题：

| 问题 | 后果 |
|---|---|
| **窃听** | 中间人能看到密码、身份证号 |
| **篡改** | 中间人往页面注入广告/恶意脚本 |
| **冒充** | 假冒银行网站，用户无法分辨 |

HTTPS = HTTP + TLS，解决这三件事：
- **加密**（对称加密传数据）→ 防窃听
- **完整性**（MAC/签名）→ 防篡改
- **身份认证**（证书）→ 防冒充

### TLS 1.2 握手（简化四步）

```
客户端                                        服务器
  │── ClientHello（支持的算法、随机数 R1）──────→│
  │←─ ServerHello（选定算法、随机数 R2、证书）──│
  │                                             │
  │  ① 验证证书链（是否可信 CA 签发、域名匹配、未过期）
  │  ② 用证书里的公钥加密 PreMaster Secret
  │── 加密的 PreMaster ─────────────────────────→│
  │                                             │
  │  双方用 R1 + R2 + PreMaster 算出同一个会话密钥
  │                                             │
  │←─ Finished（用会话密钥加密）────────────────│
  │── Finished ────────────────────────────────→│
  │                                             │
  │═══ 之后全部用对称加密（AES）传输 ═══════════│
```

::: key 为什么用"非对称 + 对称"混合
- **非对称加密（RSA/ECDHE）**：安全但**极慢**（比对称慢 100-1000 倍）
  → 只用来**协商出会话密钥**
- **对称加密（AES）**：快，但密钥怎么安全传递是个问题
  → 用它来**传实际数据**

两者结合：用非对称的慢速交换，换来对称的高速传输。
:::

### TLS 1.3 的改进

```
1-RTT 握手（1.2 需要 2-RTT）
支持 0-RTT 恢复（复用上次会话，首个请求就能带数据）
移除了不安全算法（RSA 密钥交换、RC4、SHA-1）
```

访问一个 HTTPS 网站的时间差：TLS 1.3 通常比 1.2 快 30-50ms。

### 证书链

```
根证书（Root CA，内置在浏览器/系统）
  ↓ 签发
中间证书（Intermediate CA）
  ↓ 签发
服务器证书（你的域名）
```

::: danger 自签名证书为什么会警告
因为它的签发者不在浏览器内置的"可信根证书列表"里。
浏览器无法验证"这个证书是不是真的属于这个域名" → 提示不安全。

**开发和测试可以用，但绝不能用在生产。**（Let's Encrypt 免费证书 3 个月一续，正式环境完全够用）
:::

---

## 七、HTTP 版本演进

::: compare 三个版本的核心差异
| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| 传输层 | TCP | TCP | **QUIC（UDP）** |
| 多路复用 | ❌（队头阻塞） | ✅（同连接并发流） | ✅（无 TCP 队头阻塞） |
| 头部压缩 | ❌（每次全传） | ✅（HPACK） | ✅（QPACK） |
| 服务器推送 | ❌ | ✅（已废弃） | ❌ |
| 二进制 | ❌ 文本 | ✅ 二进制帧 | ✅ |
| 连接建立 | TCP 3 次握手 + TLS | 同 | 0-RTT / 1-RTT |
:::

### HTTP/1.1 的性能问题

```http
# 浏览器对同一域名最多 6 个并发连接
# 每个请求都要单独 TCP 连接（或串行复用，有队头阻塞）
```

**HTTP/1.1 时代的优化手段（现在很多已过时）**：
- 雪碧图（合并小图标）
- 文件合并（减少请求数）
- 域名分片（突破 6 连接限制）
- 内联小资源（base64）

::: warn 这些优化在 HTTP/2 下反而有害
HTTP/2 有头部压缩和多路复用，"减少请求数"不再是目标。
**文件合并反而破坏了缓存粒度**（改一个字节要重下整个大文件）。
所以 HTTP/2 下应该：拆细文件 + 用 hash 命名 + 强缓存。
:::

### HTTP/3 为什么用 UDP

TCP 的队头阻塞：一个包丢了，后面所有包都得等重传。
QUIC 在 UDP 之上自己实现可靠传输，**流与流之间互不影响**。

代价：部分企业网络会屏蔽 UDP，需要回退到 HTTP/2。

---

## 八、RESTful 接口设计

### 设计清单

```
① 用名词表示资源，用方法表示动作
   GET /books        而不是 GET /getBooks

② 层级表达关系
   GET /readers/1/borrows      读者 1 的借阅记录

③ 用查询参数做过滤/分页/排序
   GET /books?categoryId=1&page=1&size=10&sort=price,desc

④ 状态码表达结果，body 表达数据
   201 + Location: /books/13

⑤ 版本化
   /api/v1/books      （URL 版本，最直观）
   或 Accept: application/vnd.bookhub.v1+json

⑥ 统一错误结构
   { "code": 20001, "message": "图书不存在", "path": "/api/books/99" }

⑦ 分页统一结构
   { "list": [...], "total": 100, "page": 1, "size": 10 }
```

### 一个完整的接口设计示例

```http
### 列表（带过滤、分页、排序）
GET /api/v1/books?kw=java&categoryId=1&page=1&size=10&sort=price,asc
→ 200
{
  "code": 0,
  "data": {
    "list": [{ "id": 2, "title": "Java 核心技术", ... }],
    "total": 3, "page": 1, "size": 10, "pages": 1
  }
}

### 详情
GET /api/v1/books/2
→ 200 { "code": 0, "data": { ... } }
→ 404 { "code": 20001, "message": "图书不存在" }

### 新增
POST /api/v1/books
Content-Type: application/json
{ "title": "新书", "author": "作者", "price": 59.00 }
→ 201 Created
Location: /api/v1/books/13
{ "code": 0, "data": { "id": 13 } }

### 全量更新
PUT /api/v1/books/13
{ "title": "改后", "author": "...", "price": 49.00, ... }    ← 所有字段都要给
→ 200

### 部分更新
PATCH /api/v1/books/13
{ "price": 39.00 }                                          ← 只给要改的
→ 200

### 删除
DELETE /api/v1/books/13
→ 204 No Content（无 body）

### 业务动作
POST /api/v1/books/13/borrow
{ "readerId": 1 }
→ 200 { "code": 0, "data": { "borrowId": 8, "dueDate": "2026-11-24" } }
```

### 幂等与并发控制

```http
# 乐观锁：客户端带版本号
PUT /api/v1/books/13
If-Match: "v5"                    ← 或用 body 里的 version 字段

→ 409 Conflict  如果版本不匹配（别人先改了）
```

::: tip 分页的两种实现
**offset 分页**：`LIMIT offset, size`
- 优点：可以跳到任意页
- 缺点：深分页性能差（`LIMIT 100000, 10` 要扫描 10 万行）

**cursor 分页**（游标/keyset）：`WHERE id > lastId LIMIT size`
- 优点：任何深度都很快
- 缺点：只能"下一页"，不能跳页

社交类信息流用 cursor，管理后台表格用 offset。
:::

---

## 九、本节速查

```http
# 报文
请求行 + 头 + 空行 + body
响应行 + 头 + 空行 + body（304/204 无 body）

# 方法幂等
GET/HEAD/OPTIONS 安全幂等 | PUT/DELETE 幂等 | POST/PATCH 不幂等

# 状态码
200 成功 | 201 创建 | 204 无内容
301 永久（会缓存！）| 302 临时 | 304 未修改 | 307 保持方法
400 格式错 | 401 未认证 | 403 无权限 | 404 不存在 | 405 方法不对
409 冲突 | 415 类型不支持 | 422 校验失败 | 429 限流
500 服务端错 | 502 上游坏 | 503 不可用 | 504 上游超时

# 缓存
强缓存：Cache-Control max-age / no-store
协商：ETag+If-None-Match / Last-Modified+If-Modified-Since → 304
no-cache = 每次验证（仍可缓存）；no-store = 完全不缓存

# Cookie
HttpOnly（防XSS读）/ Secure（仅HTTPS）/ SameSite（防CSRF）
跨域带 Cookie：前端 credentials + 后端 Allow-Credentials + 具体 origin

# HTTPS = HTTP + TLS
非对称协商密钥 → 对称加密传输
证书链：根 CA → 中间 CA → 服务器证书

# 版本
1.1 文本 + 队头阻塞 | 2 二进制 + 多路复用 + HPACK | 3 QUIC(UDP) + 0-RTT
```

::: interview 面试高频
**Q：GET 和 POST 的本质区别？**
A：语义不同（GET 查询、POST 提交），由此派生：GET 幂等安全可缓存可被浏览器预取，
POST 不幂等不缓存。技术上 GET 也能带 body（但不推荐），POST 也能用 URL 参数。
**不是"GET 有长度限制"** —— 那是浏览器/服务器的实现限制，不是协议规定。

**Q：301 和 302 的区别？什么时候用 307？**
A：301 永久重定向（浏览器会缓存，慎用），302 临时。
302 在历史实现中可能把 POST 改成 GET，307 明确保持原方法。
308 是永久 + 保持方法。

**Q：强缓存和协商缓存的区别？**
A：强缓存命中时浏览器**不发请求**（200 from cache）；协商缓存会发请求，
服务器判断未变则返回 304（无 body）。强缓存看 Cache-Control/Expires，协商看 ETag/Last-Modified。

**Q：为什么 HTTPS 用混合加密？**
A：非对称加密安全但慢 100-1000 倍，只用于协商会话密钥；
实际数据用对称加密（AES）传输。兼顾安全与性能。

**Q：HTTP/1.1 的队头阻塞是什么？HTTP/2 怎么解决？**
A：1.1 在同一连接上请求必须串行（前一个响应没回来，后面的等着）。
HTTP/2 引入二进制分帧 + 流（stream），同一连接上多个请求并发交错传输。
但 TCP 层仍可能队头阻塞，HTTP/3 用 QUIC(UDP) 彻底解决。

**Q：401 和 403 的区别？**
A：401 未认证（不知道你是谁，去登录）；403 已认证但无权限（知道你是谁，但不许做）。
:::

---

## 延伸练习

1. 用 `curl -v` 请求本工坊的后端接口，把完整请求/响应报文抄下来，标出每一行是什么。
2. 用浏览器 DevTools 的 Network 面板，找出一个返回 304 的请求，看它带了哪些请求头。
3. 用 `node tools/serve.mjs` 起服务，给某个文件加上 `Cache-Control: max-age=60`（改 serve.mjs），
   刷新页面观察 Network 面板显示 `(from disk cache)`。
4. 用 `curl -X POST` 触发 405，看响应头里的 `Allow` 字段。
5. 用 `curl` 请求一个不存在的路径，对比"后端返回统一 JSON 404"和"Tomcat 默认 HTML 404"的区别。
6. 设计一套图书借阅的 REST 接口（不少于 6 个端点），写出方法、路径、状态码、请求体、响应体。

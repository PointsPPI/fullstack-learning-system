# Ajax 与接口通信

::: key 一句话抓住本质
Ajax = 浏览器在**不刷新页面**的前提下，用 JS 发 HTTP 请求、拿数据、局部更新页面。
所有前端与后端的"连接"问题，本质上都归到三件事：**跨域、鉴权、错误处理**。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | XHR 工作流程 | 理解底层，才懂 fetch 封装了什么 |
| 2 | fetch 与 axios 封装 | 现代写法 |
| 3 | 同源策略与跨域三解法 | 90% 的联调问题都在这里 |
| 4 | Cookie / Session / Token | 怎么证明"我是谁" |
| 5 | 错误处理、超时、取消 | 让请求可控 |
| 6 | 表单提交与文件上传 | 两种编码格式 |

---

## 一、XHR 工作流程

### 五步走

```js
const xhr = new XMLHttpRequest();

// ① 初始化：方法 + URL + 是否异步
xhr.open('GET', '/api/books?page=1', true);

// ② 设置请求头（可选）
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.setRequestHeader('Authorization', 'Bearer ' + token);

// ③ 监听状态变化
xhr.onreadystatechange = function () {
  // readyState: 0未初始化 1已open 2已发送 3接收中 4完成
  if (xhr.readyState === 4) {
    if (xhr.status >= 200 && xhr.status < 300) {
      console.log(JSON.parse(xhr.responseText));
    } else {
      console.error('失败', xhr.status, xhr.statusText);
    }
  }
};

// ④ 发送（POST 时传 body）
xhr.send(null);

// ⑤ 取消（可选）
// xhr.abort();
```

### readyState 五个状态

| 值 | 名称 | 含义 |
|---|---|---|
| 0 | UNSENT | 已创建，未 open |
| 1 | OPENED | 已 open，未 send |
| 2 | HEADERS_RECEIVED | 已收到响应头 |
| 3 | LOADING | 正在接收响应体 |
| 4 | DONE | 完成 |

::: warn 老式写法 vs 现代写法
```js
// 现代：直接监听 load（等价于 readyState===4 且成功）
xhr.addEventListener('load', () => { ... });
xhr.addEventListener('error', () => { ... });    // 网络错误
xhr.addEventListener('timeout', () => { ... });
xhr.timeout = 5000;
```
`onreadystatechange` 会触发多次（每个状态一次），要自己判断 readyState；
`load` 只在成功完成时触发一次，更清晰。
:::

### XHR 的痛点（为什么会有 fetch）

```js
// 用 XHR 发一个 JSON POST，要写这么多
function post(url, data) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(JSON.stringify(data));
  });
}
```

痛点：回调嵌套、手动 JSON 序列化、手动状态判断、没有 Promise。

---

## 二、fetch 与 axios 封装

### fetch 基础

```js
const res = await fetch('/api/books', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  },
  body: JSON.stringify({ title: 'Java' }),
  // credentials: 'include',   // 跨域时携带 cookie
  // signal: controller.signal, // 取消
});
```

::: danger fetch 的四个陷阱（面试高频）
**① fetch 只在网络错误时 reject，HTTP 4xx/5xx 不会 reject**
```js
const res = await fetch('/api/not-exist');
// res.status === 404，但不会抛错！
if (!res.ok) throw new Error(res.status);   // ✓ 必须自己判断
```

**② 需要手动解析 body**
```js
const data = await res.json();       // 或 res.text()
```

**③ 默认不携带 cookie**
```js
fetch(url, { credentials: 'include' });   // 跨域时必须显式设置
```

**④ 没有超时机制**
```js
// 必须用 AbortController 手动实现
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
fetch(url, { signal: controller.signal });
```
:::

### 封装一个够用的 fetch

```js
// api/client.js
const BASE = '/api';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10000);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(BASE + path, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',
      body: options.data ? JSON.stringify(options.data) : options.body,
    });

    if (!res.ok) {
      // 统一错误处理
      if (res.status === 401) {
        localStorage.removeItem('token');
        location.hash = '#/login';
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    // 204 无内容
    if (res.status === 204) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (url) => request(url),
  post: (url, data) => request(url, { method: 'POST', data }),
  put: (url, data) => request(url, { method: 'PUT', data }),
  del: (url) => request(url, { method: 'DELETE' }),
};
```

### axios（如果需要更多能力）

```js
import axios from 'axios';

const instance = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器：统一加 token
instance.interceptors.request.use(config => {
  config.headers.Authorization = 'Bearer ' + localStorage.getItem('token');
  return config;
});

// 响应拦截器：统一处理错误 + 解包 data
instance.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) location.hash = '#/login';
    return Promise.reject(err.response?.data || err);
  }
);
```

::: compare fetch vs axios
| | fetch | axios |
|---|---|---|
| 内置 | ✅ 浏览器原生 | ❌ 需安装 |
| 体积 | 0 | ~13KB |
| HTTP 错误自动 reject | ❌ | ✅ |
| 自动 JSON 解析 | ❌ | ✅ |
| 超时 | 手动 AbortController | `timeout` 配置 |
| 拦截器 | ❌ | ✅ |
| 进度事件 | 需读 stream | `onUploadProgress` |
| 浏览器兼容 | 现代浏览器 | 更广 |

**建议**：学习阶段先用裸 fetch（看清本质），项目里用 axios 或自己封装。
:::

---

## 三、同源策略与跨域

### 什么是同源

同源 = **协议 + 域名 + 端口**三者全部相同。

| 页面地址 | 请求地址 | 是否同源 | 原因 |
|---|---|---|---|
| `http://a.com/x` | `http://a.com/y` | ✅ | 完全一致 |
| `http://a.com` | `https://a.com` | ❌ | 协议不同 |
| `http://a.com` | `http://b.com` | ❌ | 域名不同 |
| `http://a.com` | `http://a.com:8080` | ❌ | 端口不同 |
| `http://a.com` | `http://api.a.com` | ❌ | 子域名也算不同域 |

::: warn 同源策略限制的是什么
限制的是**读取响应**，不是"发不出去"。

请求其实**发出去了**，服务器也处理了（甚至数据已经改成功），
只是浏览器不让你的 JS 读到响应内容 —— 这就是 CSRF 攻击能生效的原因。
:::

### 三种解法

#### 解法 1：CORS（生产环境标准答案）

服务端返回响应头：

```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 3600
```

Spring Boot 配置：

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*")   // 开发环境
                // .allowedOrigins("https://yourdomain.com")  // 生产环境写死
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
```

::: danger CORS 的三个致命细节
**① `Allow-Origin` 不能是 `*`，如果同时 `allowCredentials=true`**
浏览器会直接拒绝。必须写具体的 origin（或使用 `allowedOriginPatterns`）。

**② 预检请求（OPTIONS）不带 Cookie**
预检请求不带业务凭证，所以你的鉴权拦截器**必须放行 OPTIONS**，否则预检失败，整个请求被拦。

**③ `Max-Age` 缓存预检结果**
不设的话，每个非简单请求都要先发一次 OPTIONS，等于请求翻倍。
:::

#### 预检请求（Preflight）什么时候触发

**简单请求**（不触发预检）需同时满足：
1. 方法 ∈ {GET, HEAD, POST}
2. 请求头只包含"安全列表"内的字段（Accept、Accept-Language、Content-Language、Content-Type 等）
3. `Content-Type` ∈ {`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`}

::: key 所以最常见的坑是这条
```js
fetch(url, { headers: { 'Content-Type': 'application/json' } });
```
`application/json` **不在**简单列表里 → 必然触发 OPTIONS 预检。
这就是"我明明配了 CORS，还是报错"的最常见原因之一（预检被拦截器拦了）。
:::

#### 解法 2：开发代理（本地开发最省事）

Vite：

```js
// vite.config.js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // rewrite: p => p.replace(/^\/api/, ''),
      },
    },
  },
};
```

原理：浏览器请求 `http://localhost:5173/api/books`（同源），
Vite 服务器收到后**服务端转发**到 8080。服务端之间没有同源策略，所以不跨域。

::: tip 生产环境不能用代理
代理只是开发期的便利。生产环境前端和后端通常：
- **同域部署**（后端直接把前端静态文件打进 jar）→ 天然同源，无问题
- **不同域** → 必须配 CORS
:::

#### 解法 3：Nginx 反向代理（生产常见）

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;   # history 路由 fallback
    }

    # 后端 API 转发
    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
前端请求 `/api/xxx`，Nginx 转发到后端 → 对浏览器而言同源。

#### 解法 4：JSONP（历史方案，只需了解）

```js
// 原理：<script> 标签不受同源策略限制
function jsonp(url, callbackName) {
  return new Promise((resolve) => {
    const cb = 'cb_' + Date.now();
    window[cb] = (data) => { resolve(data); delete window[cb]; };
    const s = document.createElement('script');
    s.src = `${url}?callback=${cb}`;
    document.body.appendChild(s);
  });
}
```
只支持 GET，服务端要配合返回 `cb_xxx({...})`。**现在不用了**（有 CORS 了）。

---

## 四、Cookie / Session / Token

### 三种方案对比

::: compare
| | Cookie | Session | Token（JWT） |
|---|---|---|---|
| 存哪 | 浏览器（自动携带） | 服务端内存/Redis | 客户端（localStorage/内存） |
| 服务端状态 | 无（只存 sessionId） | **有状态** | **无状态** |
| 扩展性 | 好 | 差（多台服务器需共享 session） | 好 |
| 跨域 | 需 `credentials` + CORS 配置 | 同左 | 需手动加 Header |
| 注销 | 删 cookie | 服务端删 session | 难点（需黑名单或短有效期） |
| XSS 风险 | httpOnly 可防 | 同左 | localStorage 可被 JS 读 → 有风险 |
| CSRF 风险 | **有**（自动携带） | 有 | 无（需手动加 Header） |
:::

### Cookie 关键属性

```http
Set-Cookie: sessionId=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

| 属性 | 作用 |
|---|---|
| `HttpOnly` | JS 无法读取（`document.cookie` 读不到）→ 防 XSS 窃取 |
| `Secure` | 只在 HTTPS 下发送 |
| `SameSite=Strict` | 跨站请求完全不发送 → 防 CSRF（但影响体验） |
| `SameSite=Lax` | 顶级导航 GET 会发送（默认值） |
| `SameSite=None` | 总是发送，**必须同时加 Secure** |
| `Max-Age` | 秒数，过期时间 |
| `Domain` / `Path` | 作用域 |

::: danger 三个必须记住的规则
1. **跨域请求要带 cookie**：前端 `credentials: 'include'`（fetch）或 `withCredentials: true`（axios），
   服务端 `Access-Control-Allow-Credentials: true` + 具体 origin。**缺一不可。**
2. **`SameSite=None` 必须配 `Secure`**，否则浏览器直接拒绝。
3. **JWT 放 localStorage 有 XSS 风险**。更安全的做法是放 httpOnly cookie，
   但那样就要处理 CSRF（加 SameSite 或 CSRF token）。
:::

### JWT 结构与验证

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJleHAiOjE3MDAwMDAwMDB9.signature
     ↑ header（算法）              ↑ payload（数据，**明文可解码**）              ↑ 签名
```

::: warn JWT 的 payload 不是加密的
任何人拿到 token，base64 解码就能看到里面的内容。
**绝对不要往 JWT 里放密码、身份证号等敏感信息。**

JWT 的签名只保证"没被篡改"，不保证"看不见"。
:::

```js
// 前端解析（只用于读信息，不要用来校验）
function decodeJwt(token) {
  const payload = token.split('.')[1];
  // base64url → base64
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}
```

### 完整鉴权流程

```
1. 用户提交账号密码 → POST /api/auth/login
2. 服务端校验 → 生成 token（含 userId、exp）→ 返回
3. 前端存 token（localStorage 或内存）
4. 后续每个请求：Authorization: Bearer <token>
5. 服务端拦截器校验签名 + 过期时间 → 通过则放行，否则 401
6. 前端收到 401 → 清 token → 跳登录页
```

---

## 五、错误处理、超时、取消

### 分类处理

```js
async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);

    // ① HTTP 错误（4xx/5xx）
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.message || '请求失败'), {
        kind: 'http', status: res.status, body,
      });
    }

    // ② 业务错误（HTTP 200 但 code !== 0）
    const json = await res.json();
    if (json.code !== 0) {
      throw Object.assign(new Error(json.message), { kind: 'biz', code: json.code });
    }
    return json.data;

  } catch (e) {
    // ③ 网络错误 / 中途断网
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      throw Object.assign(new Error('网络连接失败，请检查网络'), { kind: 'network' });
    }
    // ④ 主动取消
    if (e.name === 'AbortError') {
      throw Object.assign(new Error('请求已取消'), { kind: 'abort' });
    }
    // ⑤ 超时（我们自己抛的）
    throw e;
  }
}
```

### 超时 + 取消

```js
function fetchWithTimeout(url, { timeout = 8000, ...opts } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeout);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// 手动取消（比如用户切换页面、重新搜索）
let currentController = null;

function search(kw) {
  currentController?.abort();          // 取消上一次
  currentController = new AbortController();
  return fetch('/api/search?kw=' + kw, { signal: currentController.signal });
}
```

::: key 为什么要取消上一次请求
搜索框输入 "a"、"ab"、"abc"，会发 3 个请求。
如果 "a" 的响应比 "abc" 晚回来，页面就会显示 "a" 的结果 —— 这就是**竞态条件（race condition）**。
取消旧请求是最简单的解法。
:::

### 浏览器自带重试（了解）

```js
// 不推荐依赖，但可以了解
navigator.onLine;                 // 是否在线
window.addEventListener('online', () => {});
window.addEventListener('offline', () => {});
```

---

## 六、表单提交与文件上传

### 两种编码格式

::: compare
| | `application/x-www-form-urlencoded` | `multipart/form-data` |
|---|---|---|
| 格式 | `a=1&b=2`（URL 编码） | 分段，每段有自己的头 |
| 能传文件 | ❌ | ✅ |
| 体积 | 小 | 大（有边界开销） |
| 默认 | 表单默认 | 有 file 时必须用 |
| 后端接收 | `@RequestParam` / `@ModelAttribute` | `@RequestPart` / `MultipartFile` |
:::

### 表单提交的三种方式

```js
// ① 传统提交（页面跳转）
// <form action="/api/books" method="post" enctype="multipart/form-data">

// ② FormData + fetch（文件上传标准做法）
const fd = new FormData();
fd.append('title', 'Java 核心技术');
fd.append('cover', fileInput.files[0]);      // 文件
// ⚠️ 不要手动设 Content-Type，浏览器会自动加 boundary
const res = await fetch('/api/books', { method: 'POST', body: fd });

// ③ JSON + fetch（纯数据接口）
await fetch('/api/books', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Java' }),
});
```

::: danger 上传文件最大的坑：手动设 Content-Type
```js
// ✗ 会导致 boundary 丢失，后端解析失败
fetch(url, { method: 'POST', body: fd, headers: { 'Content-Type': 'multipart/form-data' } });

// ✓ 让它自动设置（必须包含 boundary=----WebKitFormBoundaryXXX）
fetch(url, { method: 'POST', body: fd });
```
:::

### 带进度上传（用 XHR，fetch 不支持上传进度）

```js
function upload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => resolve(JSON.parse(xhr.responseText)));
    xhr.addEventListener('error', () => reject(new Error('上传失败')));

    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}
```

### 后端对应（Spring Boot）

```java
@PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public R<String> upload(@RequestPart("file") MultipartFile file) {
    if (file.isEmpty()) throw new BizException(...);
    // 校验大小、类型
    String name = UUID.randomUUID() + "_" + file.getOriginalFilename();
    file.transferTo(new File(uploadDir, name));
    return R.ok("/uploads/" + name);
}
```

---

## 七、本节速查

```js
// XHR 五步：new → open → setRequestHeader → onreadystatechange → send
// readyState 4 = 完成；status 200-299 = 成功

// fetch 四个坑
// ① 4xx/5xx 不 reject → 判断 res.ok
// ② 手动 res.json()
// ③ 跨域默认不带 cookie → credentials:'include'
// ④ 无超时 → AbortController

// 跨域三解法
// ① CORS（服务端加头，生产标准）
// ② dev proxy（开发期）
// ③ Nginx 反代 / 同域部署（生产）
// 预检：非简单请求先发 OPTIONS；拦截器要放行 OPTIONS

// Cookie 属性：HttpOnly（防XSS读）/ Secure（仅HTTPS）/ SameSite（防CSRF）
// 跨域带 cookie：前端 credentials + 后端 Allow-Credentials + 具体 origin

// JWT：header.payload.signature，payload 是明文 base64，别放敏感信息

// 上传：FormData，绝不手动设 Content-Type
// 进度：只能用 XHR 的 upload.onprogress
// 取消：AbortController，搜索场景防竞态
```

::: interview 面试高频
**Q：fetch 和 XHR 的区别？fetch 有哪些坑？**
A：fetch 基于 Promise，API 更简洁。四个坑：4xx/5xx 不 reject（要判断 res.ok）、
需手动解析 body、默认不带 cookie、没有超时机制。

**Q：什么是同源策略？跨域怎么解决？**
A：协议+域名+端口三者一致才算同源。同源策略限制 JS 读取跨域响应（但不阻止发送）。
解法：CORS（服务端加响应头）、开发代理（服务端转发）、Nginx 反代、同域部署。

**Q：CORS 预检请求是什么，什么时候触发？**
A：非"简单请求"时，浏览器先发 OPTIONS 询问服务端是否允许。
触发条件：非 GET/HEAD/POST、自定义请求头、Content-Type 不是三个简单值之一。
响应里的 Access-Control-Max-Age 可缓存预检结果，减少 OPTIONS 次数。

**Q：Cookie、Session、Token 的区别？**
A：Cookie 是浏览器存储机制；Session 是服务端会话（有状态，需共享）；Token 是无状态凭证（JWT 自包含）。
Cookie 自动携带故有 CSRF 风险（SameSite/CSRF token 防）；Token 存 localStorage 有 XSS 风险（httpOnly cookie 可防但又要防 CSRF）。

**Q：上传文件为什么不能手动设 Content-Type？**
A：`multipart/form-data` 需要 boundary 分隔符，浏览器会自动生成并写入 Content-Type。
手动设置会覆盖掉 boundary，导致后端无法解析分段数据。

**Q：搜索框快速输入导致结果错乱，怎么解决？**
A：竞态条件。每次发请求前 abort 上一次（AbortController），
或用请求序号标记"只接受最新一次的响应"。
:::

---

## 延伸练习

1. 用裸 XHR 写一个 GET 请求，在 readyState 每次变化时打印状态。
2. 把上面改写成 fetch + async/await，补上 `res.ok` 判断、超时、错误分类。
3. 起一个本地静态服务器（`node tools/serve.mjs`），在页面里 fetch 一个本地 json 文件，
   然后改成用 `file://` 打开，观察报错信息。
4. 用 Spring Boot 配一个 CORS，前端用 fetch 跨端口请求，成功后再把 `allowedOrigins` 改成 `*`
   同时 `allowCredentials=true`，观察浏览器报错。
5. 写一个搜索框，输入时防抖 300ms + AbortController 取消上一次请求，用打印时间戳验证竞态已解决。
6. 实现文件上传 + 进度条，要求超过 5MB 时前端拦截并提示。

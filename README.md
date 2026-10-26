# 全栈学习系统

> 一个**可运行、可扩展**的学习系统：13 个主题、98 个学习节点、155 道题，
> 双击打开即用，不依赖网络，不动你电脑上的任何既有环境。

---

## 30 秒上手

### 从 GitHub 克隆后（首次）

```bash
git clone https://github.com/<你的用户名>/fullstack-learning-system.git
cd fullstack-learning-system
node tools/setup.mjs
```

`setup.mjs` 会检查环境并补齐**特意未提交**的四样东西：

| 未提交内容 | 原因 | setup 如何处理 |
|---|---|---|
| `tools/maven/maven-3.9.9/` | 11 MB 的 Maven 发行版 | 从华为云/清华镜像自动下载 |
| `tools/maven/repo/` | 83 MB 依赖仓库 | 首次 `mvnw` 运行时自动下载 |
| `learning-system/content.bundle.js` | 内容构建产物 | 自动运行 `build-content.mjs` |
| `dbserver/` | MySQL 数据目录（本机专属） | 首次 `db-up.bat` 时自动创建 |

### 最快：双击

```
一键启动.bat
```

它会自动：启动专用 MySQL(3307) → 打包内容 → 起后端(8080) → 起静态服务器(5173) → 打开浏览器。

### 只想看学习内容（不需要后端）

双击 `learning-system/index.html` 即可。所有内容已内联，离线可用。

### 环境要求

| 项 | 版本 | 必需 |
|---|---|---|
| Node.js | 18+ | ✅ 必需 |
| JDK | 21+ | 仅后端 / JDBC 实验需要 |
| MySQL | 8.0+ | 仅后端需要（脚本会建独立实例） |
| Maven | 无需安装 | 由 `setup.mjs` 提供 3.9.9 |

**不会碰你已有的环境**：专用 MySQL 跑在 3307（不是 3306），Maven 与依赖仓库都在项目目录内。

---

## 打开后有什么

| 入口 | 地址 | 内容 |
|---|---|---|
| 📚 **学习系统** | `http://127.0.0.1:5173/learning-system/` | 13 主题正文、测验、复习、计划、进度 |
| 🧪 **请求旅程** | `/labs/web/01-request-journey.html` | 一次请求经过的 12 个阶段，逐段可见 |
| 🧪 **图书管理** | `/labs/web/02-book-crud.html` | 原生 Ajax 增删改查，连真 MySQL |
| 🔌 **后端接口** | `http://127.0.0.1:8080/api/books` | Spring Boot REST API |

---

## 包含的 13 个主题

| 内容包 | 主题 |
|---|---|
| **前端基础** | HTML 结构 · CSS 样式与布局 · JavaScript 核心 · Vue 3 · Ajax 与接口通信 |
| **Java 工程能力** | Maven 构建工具 · HTTP 协议 · Spring Boot · IOC 与 DI |
| **数据访问层** | MySQL 与 SQL · JDBC · MyBatis · 分层解耦 |

规模：**3 个内容包 / 13 个主题 / 98 个学习节点 / 155 道题 / 约 10 万字正文**。

---

## 学习系统的六件事

::: key 它不只是"一堆文档"
| 功能 | 说明 |
|---|---|
| **进度追踪** | 每个学习点独立记录「未开始 / 学习中 / 已掌握」 |
| **间隔复习** | 艾宾浩斯曲线调度：1 / 2 / 4 / 7 / 15 / 30 天自动提醒 |
| **测验判分** | 单选/多选/判断/填空四种题型，即时判分 + 逐题解析 |
| **学习计划** | 自定任务、关联主题、截止日期、完成勾选 |
| **数据统计** | 热力图、连续天数、各主题掌握度、每日目标 |
| **全文搜索** | 标题 + 标签 + 正文，`/` 或 `Ctrl+K` 唤起 |
:::

---

## 目录结构

```
sdy/
├─ 一键启动.bat                  ← 双击这个
├─ README.md                     ← 本文件
├─ CONTENT-SPEC.md               ← 内容包规范（新增学习内容的说明书）
├─ learning-system/              ← 学习系统主体（内核 + 内容）
│  ├─ index.html                 ← 唯一入口，双击即开
│  ├─ assets/                    CSS / JS 内核（同时也是教学素材）
│  ├─ vendor/                    vue / marked / highlight.js 本地副本
│  └─ content/packs/             内容包（可无限新增）
│     ├─ web-frontend/           前端基础
│     ├─ java-engineering/       Java 工程能力
│     └─ data-access/            数据访问层
├─ labs/web/                     ← 可运行的实验页
├─ project/bookhub/              ← 主线项目（Spring Boot + MyBatis + MySQL）
│  ├─ mvnw.cmd                   工坊专用 Maven（隔离全局 Maven 4 RC）
│  └─ src/main/java/com/bookhub/ Controller / Service / Mapper 三层
├─ tools/
│  ├─ build-content.mjs          内容打包 + 结构校验
│  ├─ verify.mjs                 全链路验收
│  ├─ serve.mjs                  本地静态服务器
│  ├─ db-up.bat                  启动专用 MySQL
│  └─ maven/maven-3.9.9/         隔离的 Maven
├─ dbserver/data/                ← 专用 MySQL 数据目录（可随时删除重来）
└─ logs/                         后端与静态服务器日志
```

---

## 命令速查

```bash
# 内容
node tools/build-content.mjs        # 打包内容（改完 pack 必跑）
node tools/verify.mjs               # 全链路验收（6 项）
node tools/verify.mjs --no-net      # 跳过需要后端的检查

# 后端
cd project/bookhub
mvnw.cmd test                       # 跑测试（21 个）
mvnw.cmd spring-boot:run            # 启动（8080）
mvnw.cmd clean package              # 打包成 jar
mvnw.cmd dependency:tree            # 看依赖树

# 数据库
tools\db-up.bat                     # 启动专用实例（3307）
mysql -ubh -pbh_pwd_2026 -h127.0.0.1 -P3307 bookhub   # 连数据库

# 静态服务
node tools/serve.mjs                # 5173
```

---

## 环境说明（为什么这么做）

| 项 | 你的机器 | 本系统的处理 | 原因 |
|---|---|---|---|
| JDK | 21.0.11 | 直接使用 | Spring Boot 3.3 + Java 21 是最稳组合 |
| Maven | **4.0.0-rc-5** | **自带 3.9.9**，仓库也隔离 | RC 版与 Boot 插件兼容性未验证，不污染全局 |
| MySQL | 8.4.10（3306，密码未知） | **独立实例在 3307** | 不动你已有的库；可随时删目录重来 |
| Docker | 无 | 不用容器 | 全部 Windows 原生 |
| IDE | 无 | 不依赖 | 用 bat + mvnw 直接跑 |
| XMind | 无 | 不需要 | 内容在系统内直接浏览 |

::: warn 专用数据库的账号
```
host: 127.0.0.1   port: 3307
user: bh          password: bh_pwd_2026
databases: bookhub, sql_lab
```
root 无密码（`-uroot`）。这是**本地学习实例**，不要用于任何真实业务。
:::

---

## 怎么新增学习内容

**最简单**：告诉我"我想学 XXX"，我按 `CONTENT-SPEC.md` 产出内容包，你刷新即见。

**自己做**：
1. 在 `learning-system/content/packs/` 建新目录（id 小写连字符）
2. 写 `pack.json` + `lessons/*.md` + `quiz/*.json`
3. `node tools/build-content.mjs`
4. 刷新页面

**只想要一个小包**：学习系统 →「⚙️ 内容与设置」→「📄 下载空白模板」→ 填内容 → 导入。

详细规则见 [CONTENT-SPEC.md](CONTENT-SPEC.md)。

---

## 验收状态

```
node tools/verify.mjs

✅ 内容包结构      3 包 / 13 主题 / 98 节点 / 155 题
✅ 题库契约        155 题全部符合契约
✅ 内核语法        4 个内核文件语法正确
✅ 内核逻辑        43 项内核断言通过
✅ 前端结构        6 个文件结构完整，无外部 CDN 依赖
✅ SQL 练习库      25 道练习，答案已在真库验证
✅ 数据库连通      book 表 13 行
✅ 后端接口        列表/详情/业务码/校验/CORS 五项通过

✅ 全部 8 项通过
```

后端测试（`cd project/bookhub && mvnw.cmd test`）：

```
Tests run: 21, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

内核测试（`node tools/test-kernel.mjs`）：43 项断言覆盖内容加载、进度追踪、
复习调度、测验记录、计划管理、存档往返、内容包导入校验、Markdown 渲染、搜索。

### 真实运行过的实验（不是"应该能跑"）

| 实验 | 验证方式 | 结果 |
|---|---|---|
| 后端 REST 接口 | `curl` 实测 | 分页/详情/校验失败/库存不足/CORS 预检 全部正确 |
| 借书事务 | 实测 MySQL | stock 3→2，借阅记录落库，VO 计算字段 remainDays=30 |
| SQL 练习答案 | 真库执行 | 部门人数（行政部=0）、反连接、窗口函数 Top3 全部符合预期 |
| JDBC SQL 注入 | `java` 实跑 | Statement 版：1 行 → 4 行（被注入）；PreparedStatement 版：0 行（防住） |
| JDBC 事务回滚 | `java` 实跑 | stock 4 → 3（事务内）→ 4（回滚后），验证生效 |
| 学习系统页面 | Edge 真实截图 | 总览/正文/测验/统计/管理 5 页全部正常渲染 |
| 内容包扩展 | 加一个包再删掉 | 节点 98→100，主题 13→14，新包立刻出现在侧栏与卡片 |

---

## 快捷键

| 键 | 功能 |
|---|---|
| `/` 或 `Ctrl+K` | 聚焦搜索 |
| `Esc` | 关闭搜索/弹窗 |
| `↑` `↓` `Enter` | 搜索结果导航 |
| `g` `h` | 回学习总览 |
| `g` `r` | 今日复习 |
| `g` `p` | 学习计划 |
| `g` `s` | 学习记录 |
| `g` `m` | 内容与设置 |

---

## 数据存在哪

- **学习进度**：浏览器 `localStorage`（换浏览器会丢，重要进度请「导出」备份）
- **正文/题库**：`learning-system/content/packs/`（源码）+ `content.bundle.js`（构建产物）
- **业务数据**：MySQL 3307 `bookhub` 库

---

## 常见问题

::: danger 后端起不来
1. 检查 3307 是否在跑：`netstat -ano | findstr 3307`
2. 看日志 `logs\server.log` 最后 30 行
3. 端口 8080 被占：改 `application.yml` 的 `server.port`，或 `--server.port=8090`
4. 数据库连接失败：`tools\db-up.bat` 重跑一次
:::

::: danger 页面打开是空白 / 报"找不到内容文件"
运行 `node tools/build-content.mjs`，或直接双击 `一键启动.bat`。
:::

::: danger 前端请求报 CORS / 网络错误
- 若用 `file://` 打开 → 必须改用 `node tools/serve.mjs` 后访问 `http://127.0.0.1:5173/...`
- 若后端没起 → 先启动后端
- 若改了后端端口 → 在实验页顶部改「后端地址」
:::

::: warn 中文乱码
所有文件都是 UTF-8。bat 文件特意转成 GBK + CRLF（Windows cmd 的兼容要求）。
若终端乱码：`chcp 65001`。
:::

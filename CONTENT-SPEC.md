# 内容包规范 · Content Pack Spec v1

> 这份文档定义"如何给学习系统新增内容"。
> 你告诉我"我想学 XXX"，我按本规范产出文件，你导入系统即可 ——
> 或者你自己照着写，一样能导入。

---

## 一、最小可用内容包（30 秒看懂）

一个学习包 = **4 个必填字段** + 主题数组。

```json
{
  "id": "my-topic",
  "title": "我的学习包",
  "version": "1.0.0",
  "topics": [
    {
      "id": "intro",
      "title": "第一课",
      "lesson": "# 第一课\n\n正文用 Markdown 写。",
      "nodes": [{ "id": "n1", "title": "知识点一", "key": true }]
    }
  ]
}
```

导入方式（两种任选）：

**方式 A：学习系统界面导入**
1. 打开学习系统 → 左下角「⚙️ 内容与设置」
2. 粘贴 JSON，或点「选择文件」上传 `.json`
3. 点「校验」看是否有问题 → 点「导入」

**方式 B：放进源码目录（推荐，可版本管理）**
1. 在 `learning-system/content/packs/` 下建目录，如 `my-topic/`
2. 目录里放 `pack.json`
3. 正文写到 `my-topic/lessons/*.md`，题库写到 `my-topic/quiz/*.json`
4. 运行 `node tools/build-content.mjs`
5. 刷新页面

---

## 二、字段完整参考

### pack.json（包级）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✅ | string | 小写字母/数字/连字符，全局唯一。**必须与目录名一致** |
| `title` | ✅ | string | 显示名称，如「前端基础」 |
| `version` | ✅ | string | 语义化版本，如 `1.0.0`。升级时改这个，系统会显示新版本 |
| `description` | | string | 一句话描述，显示在包列表 |
| `color` | | string | 主题色，如 `#4f7cff` |
| `stages` | | array | 学习阶段分组，见下方 |
| `topics` | ✅ | array | 主题数组，至少 1 个 |

`stages` 用于在侧栏/总览里分组：

```json
"stages": [
  { "title": "阶段一 · 基础", "topics": ["html", "css"] },
  { "title": "阶段二 · 进阶", "topics": ["javascript"] }
]
```
`topics` 里写的是主题 id。**引用了不存在的 id 会构建失败**。

### topics[]（主题级）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✅ | string | 包内唯一，小写字母/数字/连字符 |
| `title` | ✅ | string | 主题名，如「CSS 样式与布局」 |
| `summary` | | string | 一句话摘要，显示在卡片和搜索里 |
| `tags` | | string[] | 标签，如 `["基础", "布局"]` |
| `estMin` | | number | 预计学习分钟数 |
| `lesson` | | string | 正文。**源码目录方式**写相对路径（如 `lessons/01.md`）；**界面导入方式**直接写 Markdown 全文 |
| `quiz` | | string \| array | 题库。源码方式写路径；导入方式直接写题目数组 |
| `nodes` | | array | 学习点列表，见下方。省略则整个主题算 1 个节点 |
| `prereq` | | string[] | 前置主题 id。跨包写 `"包id/主题id"` |

`nodes`（学习点）是进度追踪的最小单位 —— 每个节点独立记录「未开始/学习中/已掌握」和复习节奏。

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 包内唯一（在主题内唯一即可） |
| `title` | ✅ | 学习点名称 |
| `key` | | `true` 表示核心节点（界面上标「核心」徽章） |

---

## 三、题库格式

题库文件 = `{ "questions": [...] }`，也接受裸数组 `[...]`。

### 四种题型

```json
// 1. 单选（type 省略时默认这个）
{
  "type": "single",
  "q": "题干，可以含 Markdown 和 ```lang 代码块",
  "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
  "answer": [0],
  "explain": "解析：讲清楚为什么对、其他选项错在哪",
  "tag": "作用域"
}

// 2. 多选
{
  "type": "multi",
  "q": "以下哪些是 falsy 值？",
  "options": ["0", "[]", "''", "null"],
  "answer": [0, 2, 3],
  "explain": "[] 是 truthy —— 这是最常见的坑。",
  "tag": "类型转换"
}

// 3. 判断（不要 options，answer 是布尔）
{
  "type": "judge",
  "q": "typeof null === 'object'。",
  "answer": true,
  "explain": "这是 JS 第一版实现留下的 bug，为兼容性永久保留。",
  "tag": "类型"
}

// 4. 填空（不要 options，answer 是字符串）
{
  "type": "fill",
  "q": "Number.MAX_SAFE_INTEGER 的值是 ____。",
  "answer": "9007199254740991",
  "explain": "即 2^53 - 1，超过这个范围整数运算会丢精度。",
  "tag": "数值精度"
}
```

### 硬性规则（构建时会校验）

| 规则 | 违反后果 |
|---|---|
| `single` 的 `answer` 必须恰好 1 个元素 | 构建失败 |
| `multi` 的 `answer` 至少 2 个元素 | 构建失败 |
| `judge` 的 `answer` 必须是 `true`/`false` 布尔值 | 构建失败 |
| `judge` / `fill` 不能有 `options` | 构建失败 |
| `answer` 下标必须在 `options` 范围内 | 构建失败 |
| 每题必须有 `q` 和 `explain` | `q` 缺失构建失败，`explain` 缺失仅警告 |

---

## 四、正文写作规范（Markdown 增强）

正文是标准 Markdown（GFM），额外支持 **9 种自定义容器**，用来把「重点」从正文里视觉上拎出来：

```markdown
::: key 一句话抓住本质
核心结论放这里。渲染成品牌色高亮块。
:::

::: danger 坑点标题
最常犯的错误。
:::

::: warn 注意
容易忽略的边界情况。
:::

::: tip 小技巧
实用建议。
:::

::: compare 对比
多个方案的取舍。
:::

::: why 为什么
原理追问。
:::

::: lab 动手
实验步骤。
:::

::: interview 面试高频
面试官会怎么问，你怎么答。
:::

::: note 旁注
补充说明。
:::
```

::: warn 容器不能嵌套
`::: key` 里面不能再写 `::: tip`。但容器里可以正常写代码块、表格、列表。
:::

### 代码块

带语言标识会自动高亮 + 加复制按钮：

````markdown
```java
public class Demo { }
```
````

支持的语言：`java` `javascript` `js` `html` `css` `sql` `xml` `yaml` `bash` `json` `vue` 等（highlight.js 全部支持）。

### 表格、锚点、链接

- 表格自动包横向滚动容器
- 标题自动生成锚点，右侧自动生成目录（≥3 个 h2 时显示）
- 站内链接写 `#/topic/包id/主题id`

### 推荐结构

```markdown
# 主题名

::: key 一句话抓住本质
...
:::

## 学习点
| # | 知识点 | 一句话 |
|---|---|---|

---

## 一、第一部分
### 子标题
::: danger 坑点
:::

## 二、第二部分

---

## N、本节速查
（代码块汇总）

::: interview 面试高频
Q: ...
A: ...
:::

---

## 延伸练习
1. ...
```

---

## 五、构建校验会查什么

`node tools/build-content.mjs` 会拒绝以下情况：

```
❌ 缺 pack.json
❌ id / title / version 缺失
❌ id 格式不合规（大写下划线空格都不行）
❌ topics 不是非空数组
❌ 主题 id 缺失或重复
❌ 主题 title 缺失
❌ 节点 id 缺失或重复
❌ prereq 指向不存在的主题（含跨包检查）
❌ lesson 文件不存在
❌ quiz JSON 解析失败 或 违反题型契约
❌ stages 里引用了不存在的 topic  id
```

**构建失败不会生成半成品** —— 你会看到明确的行号和字段名，改完重跑即可。

构建成功的输出：
```
  ✓ web-frontend          5 主题 ·  34 节点 ·  60 题 · 1.0.0
  ✅ 已生成 learning-system/content.bundle.js  (536.2 KB)
```

---

## 六、新增内容的两种工作流

### 工作流 A：我来帮你做（推荐）

你只需要说一句：

> 我想学 **Redis**，包括：数据结构、持久化、缓存穿透/击穿/雪崩、分布式锁、主从与哨兵

我会产出：
```
learning-system/content/packs/redis/
├── pack.json                      ← 包定义 + 主题 + 节点 + 前置关系
├── lessons/
│   ├── 01-data-structures.md      ← 正文（概念卡/对比表/坑点/面试问答/速查）
│   ├── 02-persistence.md
│   ├── 03-cache-problems.md
│   ├── 04-distributed-lock.md
│   └── 05-replication.md
└── quiz/
    ├── 01-data-structures.json    ← 每题带解析
    └── ...
```
然后跑一次构建，你刷新页面就能看到新包。

### 工作流 B：你自己写

1. 复制 `learning-system/content/packs/web-frontend/` 为模板
2. 改 `pack.json` 的 id / title / version
3. 替换 `lessons/*.md` 和 `quiz/*.json`
4. `node tools/build-content.mjs`
5. 刷新

::: tip 只想要一个很简单的学习包？
用系统里的「📄 下载空白模板」按钮，得到一个最小可用的 JSON，
填上内容直接导入即可 —— 不需要碰源码目录。
:::

---

## 七、内容设计建议（写得好不好，差别很大）

::: key 一个"能学会"的主题长什么样
1. **开头一句话抓住本质** —— 用 `::: key` 给出最核心的结论
2. **学习点表格** —— 让人知道要学几个东西、每个为什么重要
3. **对照式讲解** —— 先给"错误/朴素写法"，再给"正确写法"，讲清为什么
4. **每个坑都要有具体现象** —— 不是"要注意 X"，而是"不这么做会报 XXX 错"
5. **可运行的代码** —— 每段代码都能复制去跑
6. **速查表** —— 学完能带走的一页纸
7. **面试问答** —— 检验是否真懂
8. **延伸练习** —— 从"读"变成"做"
:::

::: danger 常见的低质量写法
- 大段抄概念定义，没有"为什么"
- 代码只有正确版本，没有错误对照
- 坑点写成"注意边界"（等于没说）
- 没有可运行的例子
- 通篇没有一个"输出是什么"
:::

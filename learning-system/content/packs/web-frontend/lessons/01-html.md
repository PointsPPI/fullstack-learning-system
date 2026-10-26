# HTML 结构

::: key 一句话抓住本质
HTML 不是"编程语言"，它是**标记语言**：你只负责说清楚"这块内容是什么"（标题？段落？按钮？），
至于"长什么样"由 CSS 决定，"干什么"由 JS 决定。三者职责分离是整个前端的根基。
:::

## 学习点

| # | 知识点 | 为什么重要 |
|---|---|---|
| 1 | 文档骨架与 DOCTYPE | 不写 DOCTYPE 会进入怪异模式，布局全乱 |
| 2 | 语义化标签 | 影响 SEO、无障碍、代码可读性 |
| 3 | 表单与输入校验 | 几乎所有业务都涉及录入 |
| 4 | 可访问性 | 键盘用户/读屏用户能不能用 |
| 5 | meta viewport 与 SEO | 移动端不适配的直接原因 |

---

## 一、文档骨架与 DOCTYPE

一个最小可用的 HTML5 页面，只有 7 行：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>页面标题</title>
</head>
<body>
  <h1>内容</h1>
</body>
</html>
```

### 逐行解释

`<!doctype html>` —— 声明"这是 HTML5"。**必须放在第一行，前面不能有任何内容**（包括 BOM、空格、注释）。

::: danger 坑点：不写 DOCTYPE 会发生什么
浏览器会进入 **怪异模式（Quirks Mode）**，其中最要命的一条：

- 标准模式：`box-sizing` 默认 `content-box`，`<body>` 有 margin
- 怪异模式：盒模型计算方式变成 IE 那套（width 包含 padding+padding），**所有布局计算全部错位**

检查方法：在 Console 里执行 `document.compatMode`
- `"CSS1Compat"` = 标准模式 ✓
- `"BackCompat"` = 怪异模式 ✗
:::

`<html lang="zh-CN">` —— `lang` 不是装饰。它决定：
- 浏览器是否弹出"翻译此页"
- 读屏软件用哪套发音规则读（中文页面标成 `en` 会被读成拼音）
- CSS 的 `:lang()` 选择器

`<meta charset="utf-8">` —— 必须出现在 `<head>` 的**前 1024 字节内**。否则浏览器可能先用其他编码解析，等读到这行时已经解析错了，结果就是中文乱码。

::: tip 一个真实的乱码场景
服务器响应头写 `Content-Type: text/html`（不带 charset），HTML 里也没写 `<meta charset>`，
浏览器只好猜——中文环境可能猜 GBK，而你的文件是 UTF-8 存的 → 满屏"锟斤拷"。
**最保险：HTTP 头 + meta 标签两处都写 UTF-8。**
:::

`<meta name="viewport">` —— 移动端适配的开关。

```html
<!-- 没有它：手机上整个页面被缩小到 980px 宽再塞进屏幕 → 字小到看不清 -->
<meta name="viewport" content="width=device-width, initial-scale=1">
```

| 属性 | 含义 |
|---|---|
| `width=device-width` | 视口宽度 = 设备宽度（不是默认的 980px） |
| `initial-scale=1` | 初始缩放 100% |
| `maximum-scale=1` | ⚠️ 禁止用户缩放 —— **不要用**，这违反无障碍规范 |
| `user-scalable=no` | 同上，禁掉缩放等于对视力障碍者关上门 |

### 文档结构：head vs body

```
<html>
├── <head>     不可见部分：元信息、样式、脚本
│   ├── meta      元数据（字符集、视口、描述、关键词）
│   ├── title     标签页标题（也是搜索结果标题）
│   ├── link      引入 CSS / 图标 / 预加载
│   └── script    脚本
└── <body>     可见部分：用户能看到的一切
```

::: why 为什么 script 通常放在 body 末尾？
浏览器解析 HTML 是**从上到下**的。遇到 `<script>` 会**暂停解析**，先下载并执行脚本。
如果脚本在 `<head>` 且体积大，用户会看到一段白屏 —— 这就是"阻塞渲染"。

三种解法：
1. 放 body 末尾（最古老、最可靠）
2. `<script defer>` —— 延迟到 HTML 解析完再按顺序执行
3. `<script async>` —— 下载完立刻执行（顺序不保证，只适合独立脚本如统计代码）
:::

---

## 二、语义化标签

### 反例：全用 div

```html
<div class="header">
  <div class="nav">...</div>
</div>
<div class="main">
  <div class="article">
    <div class="title">文章标题</div>
    <div class="text">正文...</div>
  </div>
</div>
<div class="footer">...</div>
```

这段代码**能显示**，但：
- 读屏软件读出来是"div div div div"，用户完全不知道结构
- 搜索引擎不知道哪部分是正文主体
- 三个月后你自己也看不出哪里是导航、哪里是文章

### 正解：语义化

```html
<header>
  <nav aria-label="主导航">
    <ul>
      <li><a href="/">首页</a></li>
      <li><a href="/books">图书</a></li>
    </ul>
  </nav>
</header>

<main>
  <article>
    <h1>文章标题</h1>
    <p>正文...</p>
    <figure>
      <img src="chart.png" alt="2026 年借阅量趋势图">
      <figcaption>图 1：2026 年借阅量趋势</figcaption>
    </figure>
  </article>

  <aside aria-label="相关推荐">
    <h2>相关推荐</h2>
    <ul><li><a href="#">另一篇文章</a></li></ul>
  </aside>
</main>

<footer>
  <p>&copy; 2026 学习系统</p>
</footer>
```

### 常用语义标签速查

| 标签 | 用途 | 关键点 |
|---|---|---|
| `<header>` | 页头/区块头 | 可以有多个（每个 section 都能有） |
| `<nav>` | 导航链接组 | 不只顶部菜单，面包屑、分页也是 nav |
| `<main>` | 页面主体内容 | **一个页面只能有一个**，且不能嵌套在 article 里 |
| `<article>` | 独立完整的内容单元 | 能单独拿出去发布（帖子、新闻、卡片） |
| `<section>` | 主题性区块 | 通常要带标题；不要当 div 用 |
| `<aside>` | 侧边/附属内容 | 目录、广告、相关推荐 |
| `<figure>` + `<figcaption>` | 图 + 图注 | 代码块、表格也能用 |
| `<time datetime="2026-10-25">` | 时间 | `datetime` 给机器读，内容给人读 |
| `<mark>` | 高亮 | 搜索关键词高亮 |
| `<details>` + `<summary>` | 折叠面板 | **零 JS 实现手风琴** |
| `<dialog>` | 原生弹窗 | 自带遮罩与 Esc 关闭 |

::: lab 动手：用原生标签替代 JS
```html
<!-- 不用一行 JS，就能做出"点击展开"的效果 -->
<details>
  <summary>点击查看答案</summary>
  <p>答案就在这里。</p>
</details>
```
这是"能用原生就别写 JS"的典型案例 —— 原生标签自带无障碍支持、自带键盘操作。
:::

::: warn section 和 div 的区别不是"能不能用"，是"该不该用"
判断标准：**这个区块有没有一个可以写出来的标题？**
- 有 → `<section>`（配合 `<h2>`）
- 没有，纯粹为了布局 → `<div>`
滥用 section 会让读屏软件的"跳转到区块"功能塞满一堆无标题区块。
:::

---

## 三、表单与输入校验

### 一个完整表单

```html
<form action="/api/books" method="post" novalidate>
  <fieldset>
    <legend>新增图书</legend>

    <!-- 1. 文本框 + label 关联（两种写法） -->
    <label for="book-title">书名</label>
    <input id="book-title" name="title" type="text"
           required minlength="1" maxlength="200"
           placeholder="请输入书名"
           autocomplete="off">

    <!-- 2. 数字框 -->
    <label for="book-price">定价</label>
    <input id="book-price" name="price" type="number"
           min="0" step="0.01" value="0.00" required>

    <!-- 3. 下拉 -->
    <label for="book-cat">分类</label>
    <select id="book-cat" name="categoryId" required>
      <option value="">请选择</option>
      <option value="1">计算机</option>
      <option value="2">文学</option>
    </select>

    <!-- 4. 单选组 -->
    <fieldset>
      <legend>状态</legend>
      <label><input type="radio" name="status" value="1" checked> 上架</label>
      <label><input type="radio" name="status" value="0"> 下架</label>
    </fieldset>

    <!-- 5. 多选 -->
    <label><input type="checkbox" name="tags" value="new"> 新书</label>
    <label><input type="checkbox" name="tags" value="hot"> 热门</label>

    <!-- 6. 文本域 -->
    <label for="book-remark">简介</label>
    <textarea id="book-remark" name="remark" rows="3" maxlength="500"></textarea>

    <!-- 7. 文件 -->
    <label for="book-cover">封面</label>
    <input id="book-cover" name="cover" type="file" accept="image/*">

    <button type="submit">保存</button>
    <button type="reset">重置</button>
  </fieldset>
</form>
```

::: key label 的两种关联方式，第二种必须会用
```html
<!-- 写法 A：for 指向 id（推荐，样式好控制） -->
<label for="x">姓名</label><input id="x">

<!-- 写法 B：包裹（不用写 id，但样式受限） -->
<label>姓名 <input type="text"></label>
```
**两种都不写会怎样？** 读屏软件读不出这个输入框叫什么，用户只能听到"编辑框"。
点击文字也不会聚焦输入框 —— 移动端体验直接崩。
:::

### name 属性的重要性

```html
<!-- 会被提交：title=Java核心技术&price=149 -->
<input name="title" value="Java核心技术">
<input name="price" value="149">

<!-- 不会被提交（没有 name） -->
<input value="这个值前端拿得到，但服务端收不到">
```

::: danger 坑点：这是新手第一大坑
表单提交后后端说"收不到参数"，十有八九是**漏了 name**。
`id` 是给 CSS 和 label 用的，`name` 才是提交用的键。两者职责不同，通常两个都写。
:::

### 原生校验属性

| 属性 | 作用 | 示例 |
|---|---|---|
| `required` | 必填 | `<input required>` |
| `type="email"` | 邮箱格式 | 自动校验 @ 和域名 |
| `type="url"` | URL 格式 | 必须带协议 |
| `min` / `max` | 数值/日期范围 | `min="0" max="100"` |
| `minlength` / `maxlength` | 字符长度 | `maxlength="200"` |
| `pattern` | 正则 | `pattern="\d{11}"` 手机号 |
| `step` | 数值步长 | `step="0.01"` 金额 |

::: warn 原生校验只是"用户体验优化"，绝不是"安全"
```html
<input type="number" min="0" max="100">
```
用户打开 F12 改掉 `max`，或者直接 `curl` 发请求，你的限制就没了。

**铁律：前端校验 = 提升体验（早报错）；后端校验 = 保证正确（唯一可信）。**
两边都要写，且规则要一致。后端才是最后一道门。
:::

### 表单提交 vs Ajax 提交

```html
<!-- 方式一：原生提交 —— 页面会跳转/刷新 -->
<form action="/api/books" method="post">
  <button type="submit">保存</button>
</form>

<!-- 方式二：Ajax 提交 —— 页面不刷新（现代做法） -->
<form id="f">
  <button type="submit">保存</button>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();                    // 关键：阻止默认的页面跳转
  const data = Object.fromEntries(new FormData(e.target));
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  console.log(json);
});
</script>
```

::: tip FormData 的小陷阱
`new FormData(form)` 只收集**有 name 的**控件。
多选 checkbox 同名会得到多个值 → `Object.fromEntries` 只保留最后一个。
多选场景要用 `formData.getAll('tags')`。
:::

---

## 四、可访问性（a11y）

### 三个最常见的错误

::: danger 错误 1：用 div 当按钮
```html
<!-- ✗ 键盘 Tab 不到，回车没反应，读屏读不出"按钮" -->
<div class="btn" onclick="save()">保存</div>

<!-- ✓ 天然可聚焦、可回车、有语义 -->
<button type="button" onclick="save()">保存</button>
```
:::

::: danger 错误 2：图片没有 alt
```html
<!-- ✗ 读屏读出"image"，用户不知道是什么 -->
<img src="chart.png">

<!-- ✓ 描述内容（不是描述"图片"） -->
<img src="chart.png" alt="2026 年借阅量逐月上升趋势图">

<!-- ✓ 纯装饰图：明确告诉读屏忽略 -->
<img src="divider.png" alt="">
```
`alt=""`（空字符串）是**故意**告诉读屏"跳过这张图"，与"忘了写 alt"完全不同。
:::

::: danger 错误 3：用 placeholder 代替 label
```html
<!-- ✗ 一输入文字，提示就消失，用户忘了这栏要填什么 -->
<input placeholder="请输入手机号">

<!-- ✓ 标签一直在 -->
<label for="phone">手机号</label>
<input id="phone" placeholder="11 位数字">
```
:::

### aria 属性：只在原生标签不够用时才用

::: key 第一原则：优先用原生语义标签
```html
<!-- 不需要 aria -->
<button aria-label="关闭">×</button>       <!-- button 已有语义，aria-label 补名字 -->
<nav aria-label="主导航">...</nav>         <!-- nav 已有语义，label 区分多个 nav -->
```
`role="button"` + `tabindex="0"` + keydown 监听回车空格 —— 你花了 20 行 JS 重造了一个 `<button>`。
:::

常用 aria 属性：

| 属性 | 用途 |
|---|---|
| `aria-label` | 给元素一个可读名字（图标按钮必备） |
| `aria-labelledby` | 用另一个元素的文字当名字 |
| `aria-describedby` | 补充说明（错误提示） |
| `aria-hidden="true"` | 对读屏隐藏（纯装饰元素） |
| `aria-expanded` | 展开状态（折叠面板） |
| `aria-live="polite"` | 内容变化时通知读屏（表单错误提示） |
| `aria-invalid="true"` | 标记校验失败 |

### 键盘可达性检查清单

拿鼠标离开，只用键盘试一遍：

- [ ] `Tab` 能走到所有可交互元素，顺序符合视觉顺序
- [ ] 焦点有可见的轮廓（**千万别写 `outline: none` 而不给替代样式**）
- [ ] `Enter` / `Space` 能触发按钮
- [ ] `Esc` 能关闭弹窗
- [ ] 弹窗打开时焦点被"困"在弹窗内（focus trap）

::: lab 一个 10 秒自查
在 Console 里执行：
```js
// 列出所有不可聚焦的"假按钮"
[...document.querySelectorAll('[onclick]')]
  .filter(el => !['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName))
  .forEach(el => console.warn('假按钮：', el));
```
:::

---

## 五、meta 与 SEO

### 常用 meta

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- 搜索结果里的描述（120-160 字最佳，太长会被截断） -->
  <meta name="description" content="全栈学习系统：从 HTML 到 SpringBoot 的完整知识体系">

  <!-- 已不被主流搜索引擎使用，但有些内部系统还在读 -->
  <meta name="keywords" content="HTML,CSS,JavaScript">

  <!-- 禁止搜索引擎收录（测试环境必备） -->
  <meta name="robots" content="noindex, nofollow">

  <!-- 社交分享卡片（Open Graph） -->
  <meta property="og:title" content="学习系统">
  <meta property="og:description" content="...">
  <meta property="og:image" content="https://example.com/cover.png">

  <!-- 主题色（Android Chrome 地址栏变色） -->
  <meta name="theme-color" content="#4f7cff">
</head>
```

### 语义化标签对 SEO 的实际影响

搜索引擎爬虫看的是**结构**：

```
<h1> 只有一个 → 这是页面主题
<h2> 分章节 → 内容有组织
<article> → 这是独立内容，可能值得单独索引
<nav> → 这部分是导航，权重低
<main> → 正文在这里
```

::: warn 别做这些"SEO 优化"
- 堆砌关键词（`<meta keywords>` 早在 2009 年就被 Google 明确忽略）
- 用 `<h1>` 包整个页面所有文字
- 隐藏文字（`color:#fff` 的白字）—— 会被判定作弊降权
:::

---

## 六、本节速查

```html
<!-- 骨架 -->
<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>标题</title></head><body>...</body></html>

<!-- 语义 -->
header / nav / main / article / section / aside / footer
figure+figcaption / time[datetime] / details+summary / dialog

<!-- 表单 -->
label[for] + input[id][name] + required/min/max/pattern/step
fieldset+legend 分组 / FormData 收集 / e.preventDefault() 阻止跳转

<!-- 无障碍 -->
button 不用 div / img 必有 alt / 焦点可见 / aria-label 给图标按钮
```

::: interview 面试高频
**Q：`<div>` 和 `<section>` 有什么区别？**
A：功能上都能做容器。区别在语义：`<section>` 表示"有主题的区块"，通常应带标题；
`<div>` 是无语义的通用容器，纯粹用于布局/样式。选错不影响显示，但影响无障碍与可读性。

**Q：为什么 `<script>` 放 body 末尾？defer 和 async 的区别？**
A：脚本会阻塞 HTML 解析。放末尾可让首屏先渲染。
`defer`：并行下载，HTML 解析完后**按顺序**执行（适合有依赖的脚本）；
`async`：并行下载，**下载完立刻**执行，顺序不保证（适合独立脚本）。

**Q：前端校验能替代后端校验吗？**
A：绝对不行。前端校验可被绕过（改 DOM / 直接发请求），只提升体验；
后端校验才是数据正确性的唯一保障。两层都要有。
:::

---

## 延伸练习

1. 用纯 HTML（无 CSS/JS）写出一个图书列表页，包含：页头、导航、3 本书的 article（含标题/作者/简介）、侧边栏推荐、页脚。
2. 给上面的页面加上"新增图书"表单，要求：所有输入框都有 label、必填项有 `required`、价格用 `type="number"`、分类用 `select`。
3. 用 `document.compatMode` 检查你的页面处于标准模式还是怪异模式，试着删掉 DOCTYPE 观察区别。
4. 只用键盘（不碰鼠标）走完整个表单，记录哪些地方卡住了。

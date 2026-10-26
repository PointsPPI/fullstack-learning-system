# CSS 样式与布局

::: key 一句话抓住本质
CSS 的本质是「**选择器 + 声明块**」：选定一批元素，给它们套上一组样式。
而所有"样式没生效"的问题，99% 出在三个地方：**选择器没选中 / 优先级不够 / 被后面的规则覆盖**。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 盒模型与 box-sizing | 宽度到底算不算 padding |
| 2 | 选择器与优先级 | 为什么你的样式被覆盖了 |
| 3 | Flex 布局 | 一维排列，最常用 |
| 4 | Grid 布局 | 二维网格，最强大 |
| 5 | 定位与层叠上下文 | 绝对定位、z-index 的坑 |
| 6 | 媒体查询与响应式 | 一套代码适配所有屏幕 |
| 7 | 常见布局难题 | 居中、等高、圣杯、吸顶 |

---

## 一、盒模型与 box-sizing

### 一个元素占多大地方？

```css
.box {
  width: 200px;
  padding: 20px;
  border: 5px solid #333;
  margin: 10px;
}
```

| 模式 | 内容宽 | 实际占宽（不含 margin） | 说明 |
|---|---|---|---|
| `content-box`（默认） | 200px | 200 + 20×2 + 5×2 = **250px** | width 只算内容 |
| `border-box` | 200px | **200px** | width 含 padding + border |

::: danger 这就是布局老是"差一点"的根本原因
你写 `width: 50%`，又加了 `padding: 10px` —— 结果两个元素加起来超过 100%，直接换行。
因为默认 `content-box` 下，`50%` 是**内容宽**，padding 是额外加的。

**解法（也是所有现代项目的标配）：**
```css
*, *::before, *::after { box-sizing: border-box; }
```
改成 border-box 后，`width` 就是最终宽度，padding 往里挤，符合直觉。
:::

### 四个方向值

```css
/* 简写顺序：上 右 下 左（顺时针，从 12 点开始） */
margin: 10px 20px 30px 40px;

/* 省略规则 */
margin: 10px;                 /* 四边都是 10 */
margin: 10px 20px;            /* 上下 10，左右 20 */
margin: 10px 20px 30px;       /* 上 10，左右 20，下 30 */
```

### 外边距合并（margin collapse）—— 最高频的怪现象

::: warn 三种合并场景
```css
/* 场景 1：相邻兄弟 */
.a { margin-bottom: 30px; }
.b { margin-top: 20px; }
/* 实际间距 = max(30, 20) = 30px，不是 50px */

/* 场景 2：父子（父无 border/padding/overflow 时） */
.parent { }                 /* 没有任何分隔 */
.child  { margin-top: 20px; }
/* 结果：子元素的 margin 跑到父元素外面去了，父元素整体下移 */

/* 场景 3：空元素 */
.empty { margin: 20px 0; }
/* 自己的上下 margin 合并，等于只有一个 20px */
```

**只有垂直方向会合并，水平方向不会。**

**解法**（任选其一，让父元素"封住"子元素的 margin）：
```css
.parent {
  overflow: hidden;      /* 或 */
  padding-top: 1px;      /* 或 */
  border-top: 1px solid transparent;  /* 或 */
  display: flow-root;    /* 最现代、副作用最小 —— 推荐 */
}
```
:::

---

## 二、选择器与优先级

### 优先级怎么算

把优先级想成一个四位数：`(a, b, c, d)`

| 来源 | 权重 |
|---|---|
| 行内样式 `style="..."` | (1,0,0,0) |
| ID 选择器 `#id` | (0,1,0,0) |
| 类/属性/伪类 `.cls` `[attr]` `:hover` | (0,0,1,0) |
| 元素/伪元素 `div` `::before` | (0,0,0,1) |
| `*` 通配符、组合符 `>` `+` `~` | (0,0,0,0) 不计 |

比较规则：**从左往右逐位比，高位大的直接赢**，不会"进位"。

::: key 关键理解：10 个 class 也打不过 1 个 id
```css
.a.b.c.d.e.f.g.h.i.j { color: red; }   /* (0,0,10,0) */
#x { color: blue; }                     /* (0,1,0,0) → 赢！ */
```
因为第二位 1 > 0，后面的位数再多也没用。
:::

### 三个特殊规则

```css
/* 1. !important 直接顶到最高（除非另一个 !important 且优先级更高） */
.btn { color: red !important; }

/* 2. 继承（inherited）：不是所有属性都继承 */
/* 会继承：color, font-*, line-height, text-align, visibility, cursor */
/* 不继承：margin, padding, border, width, height, background, display */

/* 3. 层叠顺序（优先级相同时）：后写的赢 */
.a { color: red; }
.a { color: blue; }   /* 蓝色生效 */
```

::: danger !important 是技术债
一旦写了 `!important`，后面想覆盖就必须写更强的 `!important`，很快整个项目全是 `!important`。
**只在一个场景用**：覆盖第三方库的样式（且无法通过提高选择器权重解决时）。

更好的做法：提高选择器特异性，或用 CSS 变量控制。
:::

### 现代方案：`:where()` 和 `:is()`

```css
/* :is() 取括号内最高的优先级 */
:is(#a, .b) .c { }        /* 优先级 = #a + .c = (0,1,1,0) */

/* :where() 优先级恒为 0 —— 专门用来写"可被覆写的默认样式" */
:where(.card) h2 { }      /* 优先级 = (0,0,0,1)，任何 class 都能覆盖它 */
```

::: tip 什么时候用 :where()
写基础样式库（如重置样式、默认排版）时用 `:where()`，让使用者能轻松覆盖，
而不是被你的默认样式"锁死"。
:::

### 常用选择器速查

```css
/* 基础 */
div { }                  /* 元素 */
.cls { }                 /* 类 */
#id { }                  /* ID */
* { }                    /* 全部 */

/* 关系 */
.a .b { }                /* 后代（任意层级） */
.a > .b { }              /* 直接子元素 */
.a + .b { }              /* 紧邻的下一个兄弟 */
.a ~ .b { }              /* 后面所有兄弟 */

/* 属性 */
[href] { }               /* 有该属性 */
[href="x"] { }           /* 完全等于 */
[href^="http"] { }       /* 以...开头 */
[href$=".pdf"] { }       /* 以...结尾 */
[href*="book"] { }       /* 包含 */

/* 伪类（状态） */
:hover / :focus / :active / :disabled / :checked
:first-child / :last-child / :nth-child(2n+1) / :not(.x)
:focus-visible       /* 只有键盘聚焦时 —— 推荐用它做焦点样式 */

/* 伪元素（生成内容） */
::before / ::after / ::placeholder / ::selection / ::first-line
```

::: warn 一个常见误区
```css
/* ✗ 想选"最后一个 .item"，但这选的是"既是 .item 又是父元素最后一个子元素" */
.item:last-child { }

/* 如果最后一个是 <p> 而不是 .item，上面就不生效 */
/* ✓ 用 :last-of-type 或反向思考 */
```
:::

---

## 三、Flex 布局

::: key 心智模型
Flex 是**一维**布局：所有子项排成一行（或一列），你控制的是"这一行里怎么分配空间"。
**两个轴**：
- 主轴（main axis）：`flex-direction` 决定方向（默认水平）
- 交叉轴（cross axis）：垂直于主轴

所有属性分两类：**容器属性**（写在父元素）/ **项目属性**（写在子元素）。
:::

### 容器属性

```css
.container {
  display: flex;

  /* 主轴方向 */
  flex-direction: row;            /* row | row-reverse | column | column-reverse */

  /* 主轴对齐（水平方向怎么排） */
  justify-content: flex-start;    /* flex-start | flex-end | center | space-between | space-around | space-evenly */

  /* 交叉轴对齐（垂直方向怎么对） */
  align-items: stretch;           /* stretch | flex-start | flex-end | center | baseline */

  /* 多行时（需配合 flex-wrap: wrap），行与行之间怎么对齐 */
  align-content: normal;

  /* 换行 */
  flex-wrap: nowrap;              /* nowrap | wrap | wrap-reverse */

  /* 简写 */
  flex-flow: row wrap;

  /* 项目之间间距（比给每个项目加 margin 干净得多） */
  gap: 12px;
}
```

::: tip justify-content 五个值怎么记
想象一行元素：
- `flex-start` → 挤在开头
- `flex-end` → 挤在末尾
- `center` → 挤在中间
- `space-between` → 两端贴边，中间均分空隙
- `space-around` → 每个元素左右各一半空隙（所以相邻之间是贴边的两倍）
- `space-evenly` → 所有空隙完全相等
:::

### 项目属性

```css
.item {
  /* 放大：有剩余空间时，按比例分 */
  flex-grow: 0;

  /* 缩小：空间不足时，按比例压缩 */
  flex-shrink: 1;

  /* 基准尺寸：分配前的初始宽度 */
  flex-basis: auto;

  /* 简写（最常用）*/
  flex: 0 1 auto;      /* 默认值 */
  flex: 1;             /* = 1 1 0%   ← 平分剩余空间，最常用 */
  flex: auto;          /* = 1 1 auto ← 按内容大小参与分配 */
  flex: none;          /* = 0 0 auto ← 不伸不缩，固定 */

  /* 单独覆盖交叉轴对齐 */
  align-self: center;

  /* 排列顺序 */
  order: 0;
}
```

::: key flex: 1 到底等于什么？这是面试高频
`flex: 1` 展开是 `flex-grow: 1; flex-shrink: 1; flex-basis: 0%`。

**`flex-basis: 0%` 是关键**：它把"分配前的初始宽度"当作 0，
所以多个 `flex:1` 的元素会**完全等宽**，与内容多少无关。

对比 `flex: auto`（= `1 1 auto`）：基准是内容宽度，
所以内容多的元素占得更宽 —— 这才是"按内容比例分配"。
:::

### 实战：常见布局

```css
/* 1. 水平垂直居中（最经典） */
.center {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

/* 2. 两侧固定、中间自适应 */
.layout { display: flex; }
.side  { width: 220px; flex: 0 0 220px; }   /* 不伸不缩 */
.main  { flex: 1; min-width: 0; }           /* 吃掉剩余空间 */
/* 注意 min-width:0 —— 不加的话，内部超宽内容会把 main 撑破 */

/* 3. 导航栏：logo 左，菜单右 */
.nav {
  display: flex;
  align-items: center;
  gap: 16px;
}
.nav .menu { margin-left: auto; }           /* 一个 auto 就推到最右 */

/* 4. 卡片底部按钮对齐（卡片高度不一时） */
.card { display: flex; flex-direction: column; }
.card .body { flex: 1; }                    /* 内容区撑开，把 footer 压到底部 */

/* 5. 表单行：label + input */
.form-row { display: flex; align-items: center; gap: 8px; }
.form-row label { flex: 0 0 90px; }
.form-row input { flex: 1; min-width: 0; }
```

::: danger 坑点：flex 子项内容溢出
```css
.main { flex: 1; }        /* ✗ 里面放一个超长不换行的文本 → 整个 flex 布局被撑破 */
.main { flex: 1; min-width: 0; }   /* ✓ */
```
原因：flex 项的 `min-width` 默认是 `auto`（即不小于内容宽度）。
必须显式设成 `0` 才允许被压缩。**这是 Flex 布局第一大坑**，横轴用 `min-width: 0`，纵轴用 `min-height: 0`。
:::

---

## 四、Grid 布局

::: key 心智模型
Grid 是**二维**布局：你先画好"网格骨架"（几行几列），再把子项放进格子。
Flex 管"一行内怎么排"，Grid 管"整个版面怎么分"。
:::

### 定义网格

```css
.grid {
  display: grid;

  /* 列：3 列，第一列 200px，后两列平分剩余 */
  grid-template-columns: 200px 1fr 1fr;

  /* 行：自动高度，最小 80px */
  grid-template-rows: auto minmax(80px, 1fr) auto;

  /* 间距 */
  gap: 16px;                    /* 行列都是 16 */
  gap: 16px 24px;               /* 行 16，列 24 */

  /* 区域命名（可读性最强的方式） */
  grid-template-areas:
    "header header header"
    "side   main   main"
    "footer footer footer";
}
```

单位 `fr` = fraction，剩余空间的比例份。`1fr 2fr` = 1:2 分配。

### 项目定位

```css
.header { grid-area: header; }        /* 用命名区域 */

/* 或者用线号（从 1 开始，负数从末尾数） */
.item {
  grid-column: 1 / 3;         /* 从第 1 条列线到第 3 条 = 跨 2 列 */
  grid-row: 2 / 4;            /* 跨 2 行 */
  /* 等价简写 */
  grid-area: 2 / 1 / 4 / 3;   /* row-start / col-start / row-end / col-end */
}
```

### 最实用的两个套路

```css
/* 套路 1：自适应卡片墙（一行代码搞定响应式，不需要媒体查询） */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
/* 含义：每列最小 240px，能放几列放几列，剩余空间平分 */
/* auto-fit vs auto-fill：
     auto-fit → 空的轨道会被"折叠"，卡片撑满整行
     auto-fill → 空的轨道保留，卡片保持 240px 宽，右边留白
*/

/* 套路 2：整页布局 */
.page {
  display: grid;
  grid-template-rows: 60px 1fr 40px;
  grid-template-columns: 240px 1fr;
  grid-template-areas:
    "head head"
    "side main"
    "foot foot";
  min-height: 100vh;
}
```

### Flex vs Grid 怎么选

| 场景 | 选谁 | 理由 |
|---|---|---|
| 导航条、按钮组、标签列表 | **Flex** | 一维排列，数量不定 |
| 卡片墙、仪表盘、整页骨架 | **Grid** | 二维，行对齐需求强 |
| 水平垂直居中 | 都可以 | Grid 更短：`place-items: center` |
| 内容多到需要换行且每行个数固定 | **Grid** | Flex 换行后最后一行会拉伸 |

::: tip 它们不是竞争关系
真实项目里两个都用：外层 Grid 划分大区域，每个区域内部用 Flex 排细节。
```css
.layout { display: grid; grid-template-columns: 240px 1fr; }
.card   { display: flex; flex-direction: column; }
```
:::

---

## 五、定位与层叠上下文

### 五种 position

```css
.box {
  position: static;      /* 默认，不定位，top/left 无效 */
  position: relative;    /* 相对自身原位置偏移，原位置仍占空间 */
  position: absolute;    /* 相对最近的"定位祖先"偏移，脱离文档流 */
  position: fixed;       /* 相对视口偏移，滚动不动 */
  position: sticky;      /* 滚动到阈值前是 relative，之后变 fixed */
}
```

::: danger absolute 的参照物是什么？这是最高频的坑
不是"父元素"，而是**最近的 `position` 不为 `static` 的祖先**。
如果所有祖先都是 static，就相对**初始包含块（视口）**定位。

```css
/* ✗ 子元素 absolute，但父元素是 static → 跑到页面左上角去了 */
.parent { }
.child  { position: absolute; top: 0; left: 0; }

/* ✓ 给父元素加 relative（不改布局，只是建立参照） */
.parent { position: relative; }
```
:::

### z-index 的三个必要条件

::: key z-index 只在"定位元素"上生效
`z-index` 对 `position: static` 的元素**完全无效**。必须配合：
1. `position` 是 `relative/absolute/fixed/sticky`，或
2. `display: flex/grid` 的子项（此时 z-index 也生效）

并且——**z-index 只在同一个"层叠上下文"内比较**。
:::

### 层叠上下文（stacking context）

会创建新层叠上下文的情况（记住最常见的几个）：

- 根元素 `<html>`
- `position` + `z-index` 不为 auto
- `opacity` < 1
- `transform`、`filter`、`perspective` 不为 none
- `will-change` 指定了上述属性
- `isolation: isolate`
- `position: fixed` / `sticky`（多数浏览器）

::: danger 经典 bug：子元素 z-index 再高，也盖不过父元素外面的元素
```html
<div class="a" style="position:relative; z-index:1">
  <div class="child" style="position:absolute; z-index:9999">我要在最上面</div>
</div>
<div class="b" style="position:relative; z-index:2">我会盖住 .child</div>
```
`.child` 的 9999 只在 `.a` 内部有效。`.a` 整体 z-index=1 < `.b` 的 2，
所以 `.a` 里的一切（包括 9999 的子元素）都被 `.b` 盖住。

**解法**：调整 `.a` 的 z-index，而不是调子元素的。
:::

### sticky 为什么没反应？

```css
.sticky {
  position: sticky;
  top: 0;              /* 必须写 top/bottom/left/right 至少一个，否则不生效 */
}
```

::: warn sticky 失效的四个常见原因
1. **没写 `top`（或其他阈值）** —— 最常忘
2. **祖先元素有 `overflow: hidden/auto/scroll`** —— sticky 会相对那个祖先滚动，而不是视口
3. 父元素高度不够（sticky 元素不能超出父元素范围）
4. 它是 flex/grid 的子项且 `align-items` 不是默认值（会被拉伸导致没有可滚动距离）
:::

---

## 六、媒体查询与响应式

### 基本写法

```css
/* 移动优先：先写小屏样式，再用 min-width 逐级增强 */
.card { padding: 12px; }

@media (min-width: 640px)  { .card { padding: 16px; } }
@media (min-width: 1024px) { .card { padding: 24px; } }

/* 范围 */
@media (min-width: 640px) and (max-width: 1023px) { }

/* 其他媒体特性 */
@media (prefers-color-scheme: dark)   { }    /* 系统深色模式 */
@media (prefers-reduced-motion: reduce) { }  /* 用户要求减少动效 */
@media (hover: hover)                 { }    /* 有鼠标的设备（排除触屏） */
@media print                          { }    /* 打印 */
```

### 常用断点

```css
/* 业界通用的一套（Bootstrap 思路，可按需调整） */
/*  < 640px   手机 */
/*  640-1024  平板 */
/*  > 1024     桌面 */
```

::: tip 不要照抄断点，按"内容什么时候变丑"来定
断点的本质是"布局在这里撑不住了"，不是"设备宽度是 768"。
拉窄浏览器窗口，看到哪一刻布局开始难看，那里就是你的断点。
:::

### 三种响应式技术

```css
/* 1. 媒体查询：整体布局切换 */
@media (max-width: 860px) {
  .sidebar { display: none; }
}

/* 2. 弹性单位：小范围自适应 */
.container { width: min(1200px, 92%); }   /* 取小值 */
.title { font-size: clamp(20px, 4vw, 34px); }  /* 有上下限的流体字号 */

/* 3. 容器查询：根据"父容器宽度"而不是"视口宽度" */
.card-wrap { container-type: inline-size; }
@container (min-width: 400px) {
  .card { display: flex; }
}
```

::: key clamp() 是响应式字号的最佳解法
```css
font-size: clamp(最小, 理想值, 最大);
font-size: clamp(20px, 4vw, 34px);
/* 屏幕窄时 20px，够宽时 34px，中间跟随视口 4vw 平滑变化 */
```
比写 5 个媒体查询干净得多。
:::

---

## 七、常见布局难题与坑点

### 1. 水平垂直居中的 5 种写法

```css
/* ① Flex（推荐） */
.a { display: flex; justify-content: center; align-items: center; }

/* ② Grid（最短） */
.b { display: grid; place-items: center; }

/* ③ absolute + transform（不知道自身尺寸时用） */
.c { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }

/* ④ absolute + margin auto（知道宽高时用） */
.d { position: absolute; inset: 0; margin: auto; width: 200px; height: 100px; }

/* ⑤ 单行文本水平居中 */
.e { text-align: center; line-height: 100px; height: 100px; }
```

### 2. 两栏等高

```css
/* Flex 默认就等高（align-items: stretch） */
.row { display: flex; }
.row > * { }        /* 自动等高，不需要额外设置 */
```

### 3. 圣杯布局（两侧固定，中间自适应，中间先加载）

```css
.holy {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 200px;
  gap: 16px;
}
.holy main { order: -1; }   /* 或者直接在 DOM 里把 main 写前面 */
```

### 4. 文本溢出省略

```css
/* 单行 */
.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 多行（现代写法） */
.ellipsis-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```
::: warn 单行省略三件套缺一不可
`overflow:hidden` + `white-space:nowrap` + `text-overflow:ellipsis`。
少写任何一个都不生效。而且元素必须有确定的宽度（不能是 `width:auto` 且内容撑开）。
:::

### 5. 1px 边框在手机上变粗

高分屏 DPR=2 或 3 时，CSS 的 1px 会渲染成 2-3 个物理像素，看起来更粗。

```css
/* 解法：用 transform 缩放伪元素 */
.hairline { position: relative; }
.hairline::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid #ddd;
  transform: scale(.5);
  transform-origin: 0 0;
  width: 200%;
  height: 200%;
  pointer-events: none;
}
```

### 6. BFC（块级格式化上下文）

::: key BFC 是什么
BFC 是一个独立的渲染区域，内部元素的布局不影响外部。触发条件（任一）：
- `overflow` 不为 `visible`（最常用，但会裁切）
- `display: flow-root`（**最推荐**，无副作用）
- `float` 不为 `none`
- `position: absolute/fixed`
- `display: inline-block / flex / grid / table-cell`

**BFC 能解决的三个问题：**
1. 父元素高度塌陷（子元素 float 后父元素高度为 0）
2. 外边距合并
3. 阻止元素被浮动元素覆盖（两栏自适应布局的传统解法）
:::

### 7. CSS 变量（自定义属性）

```css
/* 定义：必须以 -- 开头，区分大小写 */
:root {
  --brand: #4f7cff;
  --spacing: 8px;
}

/* 使用：var(名字, 兜底值) */
.btn {
  background: var(--brand);
  padding: var(--spacing) calc(var(--spacing) * 2);
  color: var(--text-on-brand, #fff);   /* 没定义时用 #fff */
}

/* 局部覆盖：只影响该元素及其后代 */
.dark-zone { --brand: #6b93ff; }
```

::: tip CSS 变量 vs Sass 变量
- Sass 变量：**编译时**替换成固定值，浏览器看不到
- CSS 变量：**运行时**生效，可以被 JS 读写，可以响应媒体查询/伪类变化

```css
/* 这是 Sass 做不到的 */
:root { --theme: light; }
[data-theme="dark"] { --theme: dark; }
```
所以主题切换必须用 CSS 变量。
:::

---

## 八、本节速查

```css
/* 全局重置（几乎每个项目都该有） */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui; }

/* 优先级：(行内, id, class, 元素) */
/* 覆盖顺序：!important > 行内 > id > class > 元素 > 通配 */

/* Flex */
display: flex; flex-direction: row|column;
justify-content: flex-start|center|space-between|space-around|space-evenly;
align-items: stretch|center|flex-start; gap: 12px;
子项：flex: 1 | flex: 0 0 200px | min-width: 0（防溢出）

/* Grid */
display: grid;
grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
gap: 16px; place-items: center;
grid-area: 1 / 1 / 3 / 4;

/* 定位 */
position: relative|absolute|fixed|sticky;
absolute 参照最近的定位祖先；sticky 必须写 top；
z-index 只对定位元素生效，且只在本层叠上下文内比较

/* 响应式 */
@media (min-width: 640px) { }
width: min(1200px, 92%);
font-size: clamp(20px, 4vw, 34px);
```

::: interview 面试高频
**Q：为什么 `width: 50%` + `padding` 会超出父容器？**
A：默认 `box-sizing: content-box`，`width` 只算内容区，padding 和 border 额外加。
设成 `border-box` 即可。

**Q：`flex: 1` 和 `flex: auto` 的区别？**
A：`flex:1` = `1 1 0%`，基准为 0，多个元素完全等宽；
`flex:auto` = `1 1 auto`，基准是内容宽度，内容多的更宽。

**Q：z-index 为什么不起作用？**
A：三个可能：① 元素不是定位元素（position:static）；
② 父级创建了层叠上下文，父级 z-index 更低，子元素再高也没用；
③ 父级有 opacity<1 / transform 等，形成了新的层叠上下文。

**Q：怎么实现两栏等高？三栏中间自适应？**
A：等高用 Flex（align-items 默认 stretch）。三栏用
`grid-template-columns: 200px minmax(0,1fr) 200px`。

**Q：BFC 是什么，能解决什么问题？**
A：块级格式化上下文，独立渲染区域。解决父元素高度塌陷、外边距合并、
浮动元素覆盖。最推荐的触发方式是 `display: flow-root`。
:::

---

## 延伸练习

1. 用 Flex 实现一个响应式导航：宽屏 logo 左 + 菜单右，窄屏菜单折叠成汉堡按钮。
2. 用 Grid 实现卡片墙，要求每张卡片最小 240px，能放几列放几列，间距 16px，不写媒体查询。
3. 复现外边距合并：父元素 + 子元素都有 margin-top，观察效果并用 `flow-root` 修复。
4. 复现 z-index 失效：父子都设 z-index，验证"子元素再高也盖不过外面的兄弟"。
5. 用 `clamp()` 写一个标题字号，要求 320px 宽时 20px，1440px 宽时 36px，中间平滑过渡。

# Vue 3 框架

::: key 一句话抓住本质
Vue 的核心思想只有一句：**"数据变了，视图自动变。"**
你不再手动 `document.querySelector().innerHTML = ...`，而是改数据，框架帮你算最小更新。

代价是你要理解"什么算变了"（响应式）和"什么时候更新"（调度）。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 响应式原理（Proxy） | 为什么改数据视图会变 |
| 2 | 模板语法与指令 | 声明式渲染 |
| 3 | computed / watch / watchEffect | 三者到底什么时候用 |
| 4 | 组件与 props / emit | 数据怎么在组件间流动 |
| 5 | 生命周期 | 什么时候能拿到 DOM |
| 6 | 组合式 API | 逻辑复用 |
| 7 | 路由与状态管理 | 多页面与全局状态 |

---

## 一、响应式原理

### 从"手动更新"到"自动更新"

```js
// 原生 JS：数据变了，你得自己更新视图
let count = 0;
function render() { document.getElementById('n').textContent = count; }
document.getElementById('btn').onclick = () => { count++; render(); };  // 忘了 render 就白改了

// Vue：改数据就行
const count = ref(0);
// 模板里 {{ count }} 自动更新
```

### Vue 2 vs Vue 3 的实现差异

::: key 核心差异：`Object.defineProperty` vs `Proxy`
| | Vue 2 | Vue 3 |
|---|---|---|
| 手段 | `Object.defineProperty` 劫持每个**已存在的属性** | `Proxy` 代理整个对象 |
| 新增属性 | ❌ 检测不到（要用 `Vue.set`） | ✅ 能检测到 |
| 删除属性 | ❌ 检测不到（要用 `Vue.delete`） | ✅ 能检测到 |
| 数组索引赋值 | ❌ `arr[0] = x` 检测不到 | ✅ 能检测到 |
| 数组 length | ❌ 检测不到 | ✅ 能检测到 |
| Map/Set | ❌ 不支持 | ✅ 支持 |
| 性能 | 递归遍历所有属性，初始化慢 | 惰性代理，用到才处理 |
:::

手写一个极简响应式（理解原理）：

```js
// 简化版：理解"读的时候收集依赖，写的时候触发更新"
const targetMap = new WeakMap();     // { 对象: { 属性: [副作用函数] } }
let activeEffect = null;

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let deps = depsMap.get(key);
  if (!deps) depsMap.set(key, (deps = new Set()));
  deps.add(activeEffect);
}

function trigger(target, key) {
  const deps = targetMap.get(target)?.get(key);
  if (deps) deps.forEach(fn => fn());
}

function reactive(obj) {
  return new Proxy(obj, {
    get(t, k, r) {
      track(t, k);                     // 读 → 收集
      const v = Reflect.get(t, k, r);
      return typeof v === 'object' && v !== null ? reactive(v) : v;
    },
    set(t, k, v, r) {
      const ok = Reflect.set(t, k, v, r);
      trigger(t, k);                   // 写 → 通知
      return ok;
    },
    deleteProperty(t, k) {
      const ok = Reflect.deleteProperty(t, k);
      trigger(t, k);
      return ok;
    },
  });
}

function effect(fn) {
  activeEffect = fn;
  fn();                                // 执行一次，触发 get → track
  activeEffect = null;
}

// 使用
const state = reactive({ count: 0 });
effect(() => console.log('count =', state.count));
state.count++;        // 自动打印 count = 1
```

::: tip 为什么要用 Proxy 而不是 defineProperty
`Proxy` 代理的是**整个对象的行为**，所以新增/删除键、数组索引、`in` 操作符、
`Object.keys()` 都能被拦截。`defineProperty` 只能拦住"已知属性"的 get/set。

代价是 `Proxy` 无法 polyfill（IE 不支持），这也是 Vue 3 不支持 IE11 的根本原因。
:::

### ref vs reactive

```js
import { ref, reactive } from 'vue';

// ref：包装任意类型，访问要 .value（模板里自动解包）
const count = ref(0);
count.value++;                 // script 里必须 .value
// 模板里写 {{ count }} 即可，不用 .value

// reactive：只能用于对象/数组，不需要 .value
const state = reactive({ count: 0, list: [] });
state.count++;

// 推荐：统一用 ref
// 理由：ref 适用范围更广（原始值也能用）、解构后仍然是响应式
```

::: danger ref 解构丢失响应式（必考坑）
```js
const state = reactive({ count: 0 });
let { count } = state;      // ✗ count 是普通数字，改它不会触发更新
count++;

// ✓ 用 toRefs
const { count } = toRefs(state);
count.value++;              // 仍然响应式

// ✓ 或者直接用 ref
const count = ref(0);
```

同理：`props` 解构也会丢响应式（Vue 3.5+ 支持响应式解构，但旧版不行）。
:::

---

## 二、模板语法与指令

### 插值与绑定

```html
<!-- 文本 -->
<span>{{ msg }}</span>

<!-- 表达式（可以是运算、三目、函数调用，但不能是语句） -->
<span>{{ count + 1 }}</span>
<span>{{ ok ? '是' : '否' }}</span>
<span>{{ fmt(date) }}</span>
<span>{{ count++ }}</span>   <!-- ❌ 不要在模板里改数据 -->

<!-- v-html：渲染 HTML（⚠️ XSS 风险，只用于可信内容） -->
<div v-html="trustedHtml"></div>

<!-- v-bind：绑定属性（简写 :） -->
<img :src="imgUrl" :alt="title">
<button :disabled="loading">提交</button>
<div :class="{ active: isActive, 'text-lg': big }"></div>
<div :style="{ color: textColor, fontSize: size + 'px' }"></div>
```

### 核心指令

```html
<!-- v-if / v-else-if / v-else：真正的条件渲染（销毁/重建） -->
<div v-if="status === 1">上架</div>
<div v-else-if="status === 2">下架</div>
<div v-else>未知</div>

<!-- v-show：只是 display:none（保留 DOM，切换开销小） -->
<div v-show="visible">频繁切换用这个</div>

<!-- v-for：列表（必须写 :key） -->
<ul>
  <li v-for="(book, i) in books" :key="book.id">
    {{ i + 1 }}. {{ book.title }}
  </li>
</ul>
<li v-for="(val, key, idx) in obj" :key="key"></li>

<!-- v-on：事件（简写 @） -->
<button @click="count++">+1</button>
<button @click="onSave($event)">保存</button>
<form @submit.prevent="onSubmit">   <!-- .prevent 阻止默认行为 -->
<input @keyup.enter="search">
<button @click.stop="fn">阻止冒泡</button>
<button @click.once="fn">只触发一次</button>

<!-- v-model：双向绑定 -->
<input v-model="name">
<input v-model.trim="name">        <!-- 自动去首尾空格 -->
<input v-model.number="age">       <!-- 转成数字 -->
<textarea v-model="desc"></textarea>
<input type="checkbox" v-model="agree">
<select v-model="selected"><option v-for="o in opts" :value="o.id">{{ o.name }}</option></select>
```

::: danger v-if 和 v-for 不要写在一起
```html
<!-- ✗ v-if 优先级高于 v-for（Vue3），此时 item 还不存在 → 报错 -->
<li v-for="item in list" v-if="item.active">

<!-- ✓ 两种正解 -->
<!-- 方式 1：先过滤再渲染（推荐，性能好） -->
<li v-for="item in activeList" :key="item.id">
<!-- 方式 2：外层包 template -->
<template v-for="item in list" :key="item.id">
  <li v-if="item.active">{{ item.title }}</li>
</template>
```
Vue 2 里 v-for 优先，Vue 3 里 v-if 优先 —— 行为不同，所以干脆别写在一起。
:::

::: key :key 为什么不能用 index
```html
<!-- ✗ 用 index：删除第一项后，所有 key 都变了 → 整个列表重渲染，
     输入框里的内容、组件内部状态会错乱 -->
<li v-for="(b, i) in books" :key="i">

<!-- ✓ 用稳定唯一 id -->
<li v-for="b in books" :key="b.id">
```
`key` 的作用是帮 Vue 判断"这个元素是不是原来那个"，index 会随顺序变，等于没给。
:::

### 事件修饰符速查

| 修饰符 | 作用 |
|---|---|
| `.stop` | 阻止冒泡 |
| `.prevent` | 阻止默认行为 |
| `.once` | 只触发一次 |
| `.self` | 只有 target 是自身才触发 |
| `.capture` | 捕获阶段触发 |
| `.passive` | 不阻止默认行为（滚动优化） |
| `.enter` / `.esc` / `.space` | 键位 |
| `.ctrl` / `.shift` / `.alt` | 组合键 |

---

## 三、computed / watch / watchEffect

::: key 三者的本质区别
- **computed**：**派生状态**。由其他数据计算出来的值。有缓存，依赖不变不重算。
- **watch**：**监听一个值的变化，做副作用**（发请求、改 DOM、打日志）。
- **watchEffect**：自动收集依赖的 watch。写法最简，但控制力最弱。
:::

### computed

```js
import { ref, computed } from 'vue';

const books = ref([]);
const kw = ref('');

// 只读 computed
const filtered = computed(() =>
  books.value.filter(b => b.title.includes(kw.value))
);

// 可写 computed（少见但有用）
const fullName = computed({
  get: () => `${first.value} ${last.value}`,
  set: (v) => {
    const [f, l] = v.split(' ');
    first.value = f;
    last.value = l;
  },
});
```

::: tip computed 的缓存机制
```js
const expensive = computed(() => {
  console.log('计算了一次');     // 只在依赖变化时打印
  return books.value.reduce(...);
});
// 模板里用 10 次 expensive，只计算 1 次
```
如果用**方法** `{{ expensiveFn() }}`，每次渲染都会重新执行 —— 这是性能杀手。
:::

### watch

```js
// 监听 ref
watch(count, (newVal, oldVal) => console.log(newVal, oldVal));

// 监听 reactive 对象的某个属性（必须用 getter 函数）
watch(() => state.count, (nv) => {});

// 监听多个
watch([a, b], ([na, nb], [oa, ob]) => {});

// 深度监听（对象内部任何变化）
watch(state, (nv) => {}, { deep: true });

// 立即执行一次
watch(count, cb, { immediate: true });

// 只触发一次
watch(count, cb, { once: true });   // Vue 3.4+

// 停止监听（组件卸载时自动停止，手动创建的要自己停）
const stop = watch(count, cb);
stop();
```

::: danger watch 的三个坑
```js
// 坑 1：监听 reactive 对象本身，自动深度监听（性能差）
const state = reactive({ a: { b: 1 } });
watch(state, () => {});                // 隐含 deep:true

// 坑 2：监听 reactive 对象的一个原始值属性 —— 不会生效
watch(state.count, () => {});          // ✗ 报错或无效
watch(() => state.count, () => {});    // ✓ 必须包成 getter

// 坑 3：深度监听整个大数组，每次改一项都重新遍历
watch(list, cb, { deep: true });       // 大列表慎用
```
:::

### watchEffect

```js
// 自动收集依赖：用到谁就监听谁
watchEffect(() => {
  console.log(kw.value);          // 自动监听 kw
  // 修改 kw → 重新执行
});

// 停止
const stop = watchEffect(() => {});
stop();
```

### 怎么选（决策树）

```
需要"由其他数据算出一个值"？ → computed
  ↓ 否
需要"值变化时做某件事（副作用）"？ → watch
  ↓ 不知道要监听什么，想让框架自己找？ → watchEffect
```

::: compare 一张表说清
| | computed | watch | watchEffect |
|---|---|---|---|
| 返回值 | 有（派生值） | 无 | 无 |
| 缓存 | ✅ | — | ❌ |
| 依赖 | 自动收集 | 手动指定 | 自动收集 |
| 异步 | ❌ 不该有 | ✅ 常见 | ✅ |
| 首次执行 | 用到时 | 默认不执行 | 立即执行 |
| 典型用途 | 过滤/排序/格式化 | 发请求/存本地 | 简单副作用 |
:::

---

## 四、组件与 props / emit

### 定义组件

```vue
<!-- BookCard.vue -->
<script setup>
import { computed } from 'vue';

// props：父传子（只读！）
const props = defineProps({
  book: { type: Object, required: true },
  showPrice: { type: Boolean, default: true },
});

// emits：子传父
const emit = defineEmits(['select', 'remove']);

const priceText = computed(() => `¥${props.book.price.toFixed(2)}`);
</script>

<template>
  <div class="card" @click="emit('select', book.id)">
    <h3>{{ book.title }}</h3>
    <p>{{ book.author }}</p>
    <span v-if="showPrice">{{ priceText }}</span>
    <button @click.stop="emit('remove', book.id)">删除</button>
  </div>
</template>
```

### 父组件使用

```vue
<script setup>
import { ref } from 'vue';
import BookCard from './BookCard.vue';

const books = ref([...]);
const onSelect = (id) => console.log('选中', id);
</script>

<template>
  <BookCard
    v-for="b in books"
    :key="b.id"
    :book="b"
    :show-price="true"
    @select="onSelect"
    @remove="id => books = books.filter(x => x.id !== id)"
  />
</template>
```

::: danger props 是单向数据流 —— 子组件不能改
```js
// ✗ 直接改 props
props.book.title = 'x';        // Vue 会警告，且破坏可预测性

// ✓ 方式 1：本地副本
const local = ref({ ...props.book });
local.value.title = 'x';

// ✓ 方式 2：emit 让父组件改
emit('update:title', 'x');

// ✓ 方式 3：v-model 语法糖（本质是 update:xxx）
// 父：<Child v-model:title="t" />
// 子：defineProps(['title']); defineEmits(['update:title'])
```
:::

### 组件通信全谱

| 关系 | 方案 |
|---|---|
| 父 → 子 | props |
| 子 → 父 | emit |
| 双向 | `v-model`（`update:xxx`） |
| 跨层级 | `provide` / `inject` |
| 任意组件 | Pinia / 事件总线（Vue3 已移除，用 mitt） |
| 插槽内容 | `<slot>` |
| 访问子组件方法 | `ref` + `defineExpose` |

```js
// provide / inject（跨层级，不用层层传 props）
// 祖先
provide('theme', ref('dark'));
// 后代（任意深度）
const theme = inject('theme', 'light');   // 第二个参数是默认值

// 暴露给父组件
defineExpose({ focus: () => input.value.focus() });
```

### 插槽

```vue
<!-- Card.vue -->
<div class="card">
  <header><slot name="header">默认标题</slot></header>
  <main><slot></slot></main>              <!-- 默认插槽 -->
  <footer><slot name="footer" :year="2026"></slot></footer>  <!-- 作用域插槽 -->
</div>

<!-- 使用 -->
<Card>
  <template #header><h2>自定义标题</h2></template>
  正文内容
  <template #footer="{ year }">© {{ year }}</template>
</Card>
```

---

## 五、生命周期

::: key 组合式 API 的生命周期
| 选项式 | 组合式 |
|---|---|
| beforeCreate / created | `setup()` 本身（不需要钩子） |
| beforeMount | `onBeforeMount` |
| mounted | `onMounted` |
| beforeUpdate | `onBeforeUpdate` |
| updated | `onUpdated` |
| beforeUnmount | `onBeforeUnmount` |
| unmounted | `onUnmounted` |
| activated / deactivated | `onActivated` / `onDeactivated`（keep-alive） |
| errorCaptured | `onErrorCaptured` |
:::

```js
import { onMounted, onUnmounted, ref } from 'vue';

const el = ref(null);

onMounted(() => {
  // ✅ 这里才能拿到真实 DOM
  el.value.focus();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  // ✅ 清理定时器/监听器，防内存泄漏
  window.removeEventListener('resize', onResize);
});
```

::: danger 最常见的内存泄漏
```js
// ✗ 只加不减
onMounted(() => setInterval(() => poll(), 3000));

// ✓
let timer;
onMounted(() => { timer = setInterval(() => poll(), 3000); });
onUnmounted(() => clearInterval(timer));
```
Vue 会自动清理"模板里绑定的事件"，但**不会**清理你自己加的 window 监听和定时器。
:::

::: warn 为什么 onMounted 之前拿不到 DOM
因为此时 Vue 还没把虚拟 DOM 挂到真实页面上。
`setup()` 阶段只有数据，没有 DOM。这也是 `ref="el"` 绑定的元素在 mounted 前是 null 的原因。
:::

---

## 六、组合式 API 与逻辑复用

### 从"选项"到"组合"的动机

::: compare 两种写法的真实差别
**选项式（Vue 2 风格）**：一个功能相关的代码被拆到 data / computed / methods / watch 四个地方。

```js
export default {
  data() { return { list: [], loading: false, kw: '' }; },
  computed: { filtered() { return this.list.filter(...); } },
  methods: { async load() { ... }, search() { ... } },
  mounted() { this.load(); },
};
// 想看"搜索"功能？得在 4 个区块之间来回跳
```

**组合式（Vue 3）**：一个功能的代码写在一起。

```js
const list = ref([]);
const loading = ref(false);
const kw = ref('');
const filtered = computed(() => list.value.filter(...));
async function load() { ... }
// 搜索逻辑
function search() { ... }
onMounted(load);
// 全在一个地方，还可以抽成 useXxx() 复用
```
:::

### 抽成 composable（可复用逻辑）

```js
// composables/useBookList.js
import { ref, computed, onMounted } from 'vue';

export function useBookList(api) {
  const list = ref([]);
  const loading = ref(false);
  const kw = ref('');
  const error = ref(null);

  const filtered = computed(() =>
    list.value.filter(b => b.title.includes(kw.value))
  );

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      list.value = await api.getBooks();
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { list, loading, kw, error, filtered, load };
}
```

```vue
<!-- 任何组件都能用 -->
<script setup>
import { useBookList } from '@/composables/useBookList';
const { list, loading, kw, filtered } = useBookList(api);
</script>
```

::: key composable 就是"用函数封装状态 + 逻辑"
它相当于 Vue 2 的 mixin，但没有 mixin 的三个问题：
1. 命名冲突（composable 返回值可以随意重命名）
2. 来源不清晰（一眼看出数据从哪个函数来）
3. 隐式依赖（composable 的输入靠参数，不靠 this）
:::

---

## 七、路由与状态管理

### Vue Router 核心

```js
// router/index.js
import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),     // hash 模式：不需要服务端配置
  routes: [
    { path: '/', component: Home },
    { path: '/books', component: BookList },
    { path: '/books/:id', component: BookDetail, props: true },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
});
```

```vue
<!-- 声明式导航 -->
<RouterLink to="/books" active-class="on">图书</RouterLink>
<RouterView />

<!-- 编程式导航 -->
<script setup>
import { useRouter, useRoute } from 'vue-router';
const router = useRouter();
const route = useRoute();

router.push('/books');
router.push({ name: 'book', params: { id: 1 }, query: { tab: 'info' } });
router.replace('/login');            // 不产生历史记录
router.back();

route.params.id;                     // 路径参数
route.query.tab;                     // ?tab=info
</script>
```

::: key hash 模式 vs history 模式
| | hash（`#/books`） | history（`/books`） |
|---|---|---|
| 服务端配置 | 不需要 | **需要**（所有路径回退到 index.html） |
| URL 美观 | 有 # | 干净 |
| 刷新 | 正常 | 配错就 404 |
| SEO | 差 | 好 |

学习项目用 hash 最省事（`file://` 也能跑）；线上项目通常用 history + 服务端 fallback。
:::

### Pinia 状态管理

```js
// stores/book.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useBookStore = defineStore('book', () => {
  // state
  const list = ref([]);
  const loading = ref(false);

  // getters
  const count = computed(() => list.value.length);
  const available = computed(() => list.value.filter(b => b.stock > 0));

  // actions
  async function load() {
    loading.value = true;
    try { list.value = await api.getBooks(); }
    finally { loading.value = false; }
  }
  function remove(id) {
    list.value = list.value.filter(b => b.id !== id);
  }

  return { list, loading, count, available, load, remove };
});
```

```vue
<script setup>
import { useBookStore } from '@/stores/book';
const store = useBookStore();

store.load();
store.list;          // 直接访问，不需要 .value
</script>
```

::: tip 什么时候才需要全局状态
不要什么都往 Pinia 塞。判断标准：

- 只有**一个组件**用 → `ref` 就够
- **父子**之间用 → props / emit
- **多个不相邻组件**共享，且需要跨页面存活 → Pinia
- 服务端数据缓存 → 专门的请求库（如 TanStack Query）更合适

把"组件本地状态"放进全局，是新手最常见的过度设计。
:::

---

## 八、本节速查

```js
// 响应式
ref(0).value++;  reactive({}).count++;
toRefs(state)  // 解构保响应式
Proxy 能检测新增/删除属性、数组索引；defineProperty 不能

// 模板
{{ }} 插值 | :attr 绑定 | @event 事件 | v-model 双向
v-if（销毁重建）/ v-show（display）
v-for 必须 :key="稳定id"，不要用 index
v-if 不要和 v-for 同元素

// 三件套
computed：派生值，有缓存
watch：副作用，监听指定值
watchEffect：自动收集依赖，立即执行

// 组件
defineProps / defineEmits / defineExpose
props 单向只读；子改父用 emit
provide / inject 跨层级
v-model 本质是 :value + @update:value

// 生命周期
onMounted（可拿 DOM）/ onUnmounted（清定时器监听器）

// 组合式
composable = 函数封装 state + logic，替代 mixin

// 路由
createWebHashHistory（无需服务端）/ createWebHistory（需 fallback）
useRouter() 编程式 / useRoute() 读参数

// Pinia
defineStore('id', () => { state/actions; return {...} })
```

::: interview 面试高频
**Q：Vue 3 为什么用 Proxy 替代 defineProperty？**
A：defineProperty 只能拦截已存在的属性读写，无法检测新增/删除属性、
数组索引赋值、length 变化、Map/Set。Proxy 代理整个对象的操作，
全部能拦截，且是惰性代理（性能更好）。缺点是 Proxy 无法 polyfill，所以不支持 IE11。

**Q：computed 和 watch 有什么区别？**
A：computed 是"派生值"，必须有返回值，有缓存，依赖不变不重算；
watch 是"副作用"，监听变化后执行动作（发请求、改 DOM），无返回值。
能用 computed 解决的就别用 watch。

**Q：为什么 v-for 的 key 不能用 index？**
A：key 用于 diff 时识别元素身份。用 index 时，删除/插入会导致后续所有元素的
key 变化，Vue 会认为"全部变了"→ 整体重渲染，且组件内部状态（输入框内容）会错位。
要用稳定的唯一 id。

**Q：props 为什么不能直接改？**
A：Vue 是单向数据流，props 属于父组件。子组件直接改会导致"数据来源不可追溯"，
多个子组件改同一个 prop 时无法确定谁改的。正确做法是 emit 让父改，或用本地副本。

**Q：onMounted 之前为什么拿不到 DOM？**
A：Vue 的渲染流程是 setup（建立响应式数据）→ 生成虚拟 DOM → patch 到真实 DOM。
onMounted 在 patch 完成后调用，此时才有真实 DOM。
:::

---

## 延伸练习

1. 用 `ref` 和 `reactive` 各写一个计数器，对比 `.value` 的使用差异。
2. 写一个 `useDebounce` composable，接收 ref 和延迟，返回防抖后的 ref。
3. 实现一个图书列表：支持搜索（computed 过滤）、加载状态、删除（emit）。
4. 用 `provide/inject` 实现主题切换（祖先存 theme，任意后代读取并切换）。
5. 用 Pinia 管理购物车：加/减/清空/总价（用 computed 算总价）。
6. 复现"v-for 用 index 当 key"导致的输入框内容错乱问题，再用 id 修复。

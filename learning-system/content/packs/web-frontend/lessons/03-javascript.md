# JavaScript 核心

::: key 一句话抓住本质
JavaScript 的所有"怪异行为"，几乎都能追溯到三件事：
**① 它是单线程 + 事件循环；② 它是原型继承而非类继承；③ 它的 this 是运行时动态绑定的。**
把这三件事吃透，你就再也不怕"输出什么"的面试题。
:::

## 学习点

| # | 知识点 | 面试出现率 |
|---|---|---|
| 1 | 类型与隐式转换 | ★★★★ |
| 2 | 作用域链与闭包 | ★★★★★ |
| 3 | this 绑定四种规则 | ★★★★★ |
| 4 | 原型链与 class | ★★★★ |
| 5 | 事件循环：宏任务与微任务 | ★★★★★ |
| 6 | Promise 与 async/await | ★★★★★ |
| 7 | DOM 操作与事件委托 | ★★★ |
| 8 | 模块化 ESM | ★★★ |
| 9 | 深浅拷贝与防抖节流 | ★★★★ |

---

## 一、类型与隐式转换

### 八种类型

```js
// 7 种原始类型（primitive）
typeof 1          // 'number'
typeof 'a'        // 'string'
typeof true       // 'boolean'
typeof undefined  // 'undefined'
typeof Symbol()   // 'symbol'
typeof 10n        // 'bigint'
typeof null       // 'object'  ← 历史 bug，永远记住这个例外

// 1 种引用类型
typeof {}         // 'object'
typeof []         // 'object'
typeof function(){} // 'function'  ← 也是 object，但 typeof 特判
```

::: danger typeof null === 'object' 是 JS 最著名的 bug
1995 年 JS 第一版的实现里，值的类型用低 3 位标记，`000` 表示 object，
而 `null` 被表示成空指针（全 0），于是被判定为 object。为了兼容性，这个 bug 永远修不了。

**判断 null 要用 `x === null`；判断数组用 `Array.isArray(x)`。**
:::

### 真假值（truthy / falsy）

```js
// 只有 8 个 falsy 值，其余全是 truthy
false, 0, -0, 0n, '', null, undefined, NaN

// 特别注意这几个"看起来是空但是 truthy"的
[]          // truthy！
{}          // truthy！
'0'         // truthy！
' '         // truthy（含空格的字符串）
function(){} // truthy
```

::: warn 经典坑：`if ([])` 是成立的
```js
if ([]) console.log('进了');     // 会打印！
if (arr.length) { }             // ✓ 判断空数组要用 length
if (Object.keys(obj).length) {} // ✓ 判断空对象
```
:::

### 隐式转换规则

`+` 号有两种行为，看有没有字符串：
```js
1 + 2          // 3      都是数字 → 加法
'1' + 2        // '12'   有字符串 → 拼接
1 + '2'        // '12'
1 + true       // 2      true → 1
1 + null       // 1      null → 0
1 + undefined  // NaN    undefined → NaN

[] + {}        // '[object Object]'   []→'' , {}→'[object Object]'
[] + []        // ''
{} + []        // 0（在表达式位置 {} 被当代码块，实际是 +[] → 0）
```

其他运算符只会转数字：
```js
'5' - 2        // 3
'5' * '2'      // 10
true + true    // 2
[] - 1         // -1     [].valueOf() 还是 []，再 toString() → '' → 0
```

::: key 转换的三步走
对象转原始值，JS 按这个顺序尝试：
1. `Symbol.toPrimitive`（如果定义了）
2. `valueOf()`（如果返回原始值）
3. `toString()`（如果返回原始值）

```js
const obj = {
  valueOf() { return 42; },
  toString() { return 'str'; }
};
obj + 1        // 43（valueOf 先被调用）
`${obj}`       // '42'（模板字符串走 toString？不，也走 ToPrimitive，hint=string → toString 优先）
```
:::

### `==` vs `===`

```js
// === 严格相等：类型不同直接 false
1 === '1'      // false

// == 宽松相等：会做类型转换
1 == '1'       // true
null == undefined   // true  ← 只有这一对特殊
null == 0      // false ← null 只和 undefined 相等
NaN == NaN     // false ← NaN 不等于自己

// 对象比较的是引用
{} == {}       // false
const a = {}; a == a  // true
```

::: danger 项目里永远用 ===
唯一的例外：`x == null` 可以同时判断 null 和 undefined（一种刻意的简写）。
其余全部用 `===`。
:::

### NaN 与浮点

```js
NaN === NaN          // false
Number.isNaN(NaN)    // true   ← 用这个
isNaN('abc')         // true   ← 全局 isNaN 会先转数字，'abc'→NaN，所以也 true
Number.isNaN('abc')  // false  ← 不转换，直接判断"是不是 NaN 这个值"

0.1 + 0.2 === 0.3           // false ！！！
0.1 + 0.2                   // 0.30000000000000004
Math.abs(0.1+0.2-0.3) < 1e-10  // ✓ 浮点比较要允许误差

// 整数安全范围
Number.MAX_SAFE_INTEGER      // 9007199254740991 = 2^53 - 1
9007199254740992 + 1 === 9007199254740992  // true（精度丢失）
```

::: tip 为什么 0.1+0.2 不等于 0.3
因为 IEEE 754 双精度浮点用二进制表示小数，0.1 和 0.2 都无法精确表示
（就像十进制无法精确表示 1/3）。这不是 JS 的 bug，是所有用二进制浮点的语言共同的问题。
:::

---

## 二、作用域链与闭包

### 三种作用域

```js
// 1. 全局作用域
var g = 1;
function f() {
  // 2. 函数作用域
  var local = 2;

  if (true) {
    // 3. 块级作用域（let / const 才有）
    let block = 3;
  }
  // console.log(block);  // ReferenceError
}
```

::: key var vs let vs const
| | var | let | const |
|---|---|---|---|
| 作用域 | 函数 | 块 | 块 |
| 变量提升 | 提升且初始化为 undefined | 提升但"暂时性死区" | 同 let |
| 重复声明 | 允许 | 报错 | 报错 |
| 可重新赋值 | 是 | 是 | 否（但对象内容可变） |

```js
console.log(a);  // undefined（var 提升并初始化）
var a = 1;

console.log(b);  // ReferenceError: Cannot access 'b' before initialization
let b = 1;
```
"暂时性死区"（TDZ）：let/const 声明前的区域，访问会报错。
这不是"没提升"，而是"提升了但不让访问"。
:::

### 闭包

::: key 定义
闭包 = **函数 + 它被创建时所处的词法环境**。
只要内部函数还在被引用，外层函数的变量就不会被销毁。
:::

```js
function counter() {
  let count = 0;           // 这个变量本该在 counter 执行完后销毁
  return function () {
    count++;               // 但内部函数引用了它 → 形成闭包 → 保留下来
    return count;
  };
}

const c1 = counter();
c1();  // 1
c1();  // 2
const c2 = counter();  // 新的独立闭包
c2();  // 1  ← 与 c1 互不影响
```

### 经典循环题（必考）

```js
// 题：期望输出 0 1 2，实际输出 3 3 3
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```

::: danger 为什么是 333
`var` 是函数作用域，整个循环共用**一个** `i`。
setTimeout 的回调在循环结束后才执行，那时 `i` 已经是 3。

**三种修复方式：**
```js
// ① let（最简单，每次迭代创建新绑定）
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i), 0);

// ② IIFE 传参（ES5 时代的标准解法）
for (var i = 0; i < 3; i++) {
  (function (j) { setTimeout(() => console.log(j), 0); })(i);
}

// ③ setTimeout 第三个参数
for (var i = 0; i < 3; i++) {
  setTimeout((j) => console.log(j), 0, i);
}
```
:::

### 闭包的实际用途

```js
// 1. 私有变量（模块模式）
function createStore() {
  let state = {};                        // 外部无法直接访问
  return {
    get: (k) => state[k],
    set: (k, v) => { state[k] = v; },
  };
}

// 2. 函数柯里化 / 偏函数
const add = (a) => (b) => a + b;
const add5 = add(5);
add5(3);   // 8

// 3. 防抖节流（后面讲）

// 4. 缓存（memo 化）
function memoize(fn) {
  const cache = new Map();               // 被闭包持有
  return function (n) {
    if (cache.has(n)) return cache.get(n);
    const r = fn(n);
    cache.set(n, r);
    return r;
  };
}
```

::: warn 闭包的风险：内存泄漏
闭包会持有外层变量，如果闭包本身长期存在（如挂在全局、绑在 DOM 上没解绑），
那些变量就永远回收不了。

```js
// ✗ 每次调用都创建新定时器，旧的不清理
function start() {
  const big = new Array(1e6).fill('x');
  setInterval(() => console.log(big.length), 1000);
}
// 现代浏览器里 setInterval 会被 GC 拦住——但这种写法本身就是隐患

// ✓ 记得清理
const timer = setInterval(...);
clearInterval(timer);
```
:::

---

## 三、this 绑定四种规则

::: key 优先级从高到低
1. **new 绑定**：`new Foo()` → this 指向新创建的对象
2. **显式绑定**：`call` / `apply` / `bind` → this 指向传入的对象
3. **隐式绑定**：`obj.fn()` → this 指向 obj
4. **默认绑定**：`fn()` → 严格模式下 undefined，非严格模式下 window

箭头函数是**例外**：它没有自己的 this，取定义时外层作用域的 this。
:::

```js
// ① 默认绑定
function f() { console.log(this); }
f();                        // 非严格模式：window / 严格模式：undefined

// ② 隐式绑定
const obj = { name: 'A', say() { console.log(this.name); } };
obj.say();                  // 'A'

// ③ 隐式绑定丢失（最高频陷阱）
const say = obj.say;
say();                      // undefined（this 变成 window/undefined）

setTimeout(obj.say, 0);     // 同上，丢失

// ④ 显式绑定
obj.say.call({ name: 'B' });      // 'B'
obj.say.apply({ name: 'B' });     // 'B'
const bound = obj.say.bind({ name: 'C' });
bound();                          // 'C'（永久绑定，再 call 也改不了）

// ⑤ new 绑定
function Person(name) { this.name = name; }
const p = new Person('D');        // this = 新对象 p
```

::: danger 四种"this 丢失"的场景
```js
// 1. 方法被单独赋值
const fn = obj.method;
fn();                        // this 丢了

// 2. 作为回调传递
[1,2,3].forEach(obj.method); // this 丢了

// 3. 定时器
setTimeout(obj.method, 100); // this 丢了

// 4. 事件监听
el.addEventListener('click', obj.method);   // this 变成 el
```

**三种修复：**
```js
// ① bind
setTimeout(obj.method.bind(obj), 100);

// ② 箭头函数包一层
setTimeout(() => obj.method(), 100);

// ③ 类中用箭头函数定义方法（class field）
class A {
  method = () => { this.x = 1; };  // 箭头函数自动绑定实例
}
```
:::

### 箭头函数的 this

```js
const obj = {
  name: 'A',
  regular() { return this.name; },
  arrow: () => this.name,        // this = 定义时的外层（这里可能是 window）
};

obj.regular();   // 'A'
obj.arrow();     // undefined（箭头函数的 this 跟 obj 无关！）
```

::: key 箭头函数的四个"不能"
1. 不能改 this（call/apply/bind 无效）
2. 不能用作构造函数（没有 [[Construct]]，`new arrowFn()` 报错）
3. 没有 `arguments`（用 rest 参数代替）
4. 没有 `prototype`
:::

---

## 四、原型链与 class

### 三个关键概念

```js
function Foo() {}
const f = new Foo();

f.__proto__ === Foo.prototype       // true   ← 实例的原型指向构造函数的 prototype
Foo.prototype.constructor === Foo   // true   ← 循环引用
Foo.__proto__ === Function.prototype // true  ← 函数也是对象
Object.getPrototypeOf(f) === Foo.prototype // true（标准写法）
```

::: key 原型链查找过程
`f.toString()` 的查找路径：
```
f 自己没有 toString
→ f.__proto__（Foo.prototype）没有
→ Foo.prototype.__proto__（Object.prototype）有 toString ✓
→ 调用
→ 再往上 Object.prototype.__proto__ === null → 查找结束
```
这就是"原型链"。找不到就是 `undefined`（属性）或 `TypeError`（方法）。
:::

### 手写一个继承

```js
// ES5 寄生组合继承（面试常考）
function Parent(name) {
  this.name = name;
  this.colors = ['red'];
}
Parent.prototype.sayHi = function () { return this.name; };

function Child(name, age) {
  Parent.call(this, name);       // 继承实例属性
  this.age = age;
}
Child.prototype = Object.create(Parent.prototype);  // 继承原型方法
Child.prototype.constructor = Child;                 // 修正 constructor
```

### class 只是语法糖

```js
class Animal {
  #secret = 1;                    // 私有字段（真私有，外部访问报错）
  static count = 0;               // 静态属性
  constructor(name) { this.name = name; Animal.count++; }
  speak() { return `${this.name} makes a sound`; }
  get upper() { return this.name.toUpperCase(); }   // getter
  static create(n) { return new Animal(n); }        // 静态方法
}
class Dog extends Animal {
  constructor(name, breed) {
    super(name);                  // 必须先调 super 才能用 this
    this.breed = breed;
  }
  speak() { return super.speak() + ' (woof)'; }     // 调父类方法
}
```

::: warn class 和函数的区别（面试常问）
| | 函数 | class |
|---|---|---|
| 提升 | 声明提升 | 不提升（TDZ） |
| 调用 | 可直接调用 | 必须 `new`，否则 TypeError |
| 严格模式 | 否 | 内部总是严格模式 |
| 枚举原型方法 | 可枚举 | 不可枚举 |
| 本质 | 还是函数（`typeof class === 'function'`） | 语法糖 + 更严格的语义 |
:::

---

## 五、事件循环：宏任务与微任务

::: key 一句话模型
JS 是单线程的，靠**事件循环**调度：
1. 执行完同步代码（调用栈清空）
2. **清空所有微任务队列**
3. 取一个宏任务执行
4. 回到第 2 步
:::

### 任务分类

| 类型 | 例子 |
|---|---|
| **宏任务**（macrotask） | `setTimeout`、`setInterval`、`setImmediate`(Node)、I/O、UI 渲染、`MessageChannel` |
| **微任务**（microtask） | `Promise.then/catch/finally`、`queueMicrotask`、`MutationObserver`、`await` 后面的代码 |
| 同步代码 | 立即执行，属于第一个宏任务的一部分 |

### 必考输出题

```js
console.log('1');

setTimeout(() => console.log('2'), 0);

Promise.resolve().then(() => console.log('3'));

console.log('4');

// 输出：1 → 4 → 3 → 2
```

::: key 拆解过程
1. 同步：打印 `1`、`4` → 调用栈空
2. 微任务队列：`[Promise.then]` → 执行，打印 `3`
3. 微任务清空
4. 取宏任务：`setTimeout` 回调 → 打印 `2`
:::

### 更复杂的例子

```js
async function async1() {
  console.log('a1');
  await async2();          // await 前面的同步执行，后面的进微任务
  console.log('a2');
}
async function async2() {
  console.log('a3');
}

console.log('start');
setTimeout(() => console.log('timeout'), 0);
async1();
new Promise((resolve) => {
  console.log('p1');
  resolve();
}).then(() => console.log('p2'));
console.log('end');

// 输出顺序：
// start
// a1
// a3
// p1
// end
// a2      ← 微任务（await 之后的代码）
// p2      ← 微任务
// timeout ← 宏任务
```

::: danger 关于 await 的三个精确理解
1. `await` **右边**的表达式是同步执行的
2. `await` **下面**的代码相当于放进 `.then()` 里 —— 是微任务
3. `await` 会把后续代码**加入微任务队列**，但它自己所在的函数会立即返回一个 pending Promise 给调用者
:::

### 为什么微任务会"饿死"渲染

```js
// ✗ 死循环：永远在清微任务，页面完全卡死，连控制台都不响应
function loop() {
  Promise.resolve().then(loop);
}
loop();
```

宏任务之间浏览器才有机会渲染。微任务队列不清空不会执行下一个宏任务。

---

## 六、Promise 与 async/await

### 三种状态

```
pending（进行中） → fulfilled（成功）
                 → rejected（失败）
```
状态不可逆，一旦改变就固定。

### 基础用法

```js
const p = new Promise((resolve, reject) => {
  // 执行器函数：同步立即执行
  const ok = Math.random() > 0.5;
  setTimeout(() => {
    ok ? resolve('成功值') : reject(new Error('失败原因'));
  }, 100);
});

p.then(v => console.log('成功', v))
 .catch(e => console.log('失败', e.message))
 .finally(() => console.log('总会执行'));
```

::: warn 三个常见错误
```js
// ✗ 错误 1：忘记 return，链式断裂
fetch('/a').then(r => {
  fetch('/b');           // 这个 Promise 没人管
}).then(() => { /* 拿不到 /b 的结果 */ });

// ✓
fetch('/a').then(r => fetch('/b')).then(...);

// ✗ 错误 2：在 then 里抛错却没 catch
// ✓ 每条链末尾都要 .catch()

// ✗ 错误 3：Promise 里同步抛错
new Promise(() => { throw new Error('x'); });  // 会被捕获成 reject，OK
// 但 .then(v => { throw new Error('x'); })   // 也会变成 reject，下一个 catch 能捕获
```
:::

### 四个组合方法

```js
// 1. Promise.all —— 全部成功才成功，有一个失败就整体失败（快速失败）
const [a, b] = await Promise.all([fetchA(), fetchB()]);

// 2. Promise.allSettled —— 等所有完成，不管成功失败
const results = await Promise.allSettled([fetchA(), fetchB()]);
// [{status:'fulfilled', value}, {status:'rejected', reason}]

// 3. Promise.race —— 谁先完成用谁（成功或失败）
await Promise.race([fetchData(), timeout(3000)]);   // 超时控制

// 4. Promise.any —— 第一个成功就用（全失败才失败）
await Promise.any([mirror1(), mirror2()]);          // 多镜像竞速
```

::: key 怎么选
| 需求 | 用 |
|---|---|
| 必须全部成功 | `all` |
| 都要结果，允许部分失败 | `allSettled` |
| 只要最快的一个（不论成败） | `race`（超时控制） |
| 只要最快的**成功** | `any`（多源容错） |
:::

### async/await

```js
// Promise 写法
function load() {
  return fetch('/api/books')
    .then(r => r.json())
    .then(data => data.list)
    .catch(e => { console.error(e); return []; });
}

// async/await 写法（等价）
async function load2() {
  try {
    const r = await fetch('/api/books');
    const data = await r.json();
    return data.list;
  } catch (e) {
    console.error(e);
    return [];
  }
}
```

::: danger async 函数永远返回 Promise —— 别双重 await
```js
// ✗ 多余的 await（虽然没错，但多一层微任务）
async function a() { return 1; }
const x = await (await a());

// ✓
const x = await a();
```

**另一个高频坑：忘记 await**
```js
async function save() { await db.insert(...); }

// ✗ 没有 await，错误不会被 try/catch 捕获，异常变成 unhandled rejection
try { save(); } catch (e) { /* 永远进不来 */ }

// ✓
try { await save(); } catch (e) { }
```
:::

### 手写 Promise.all（面试常考）

```js
function myAll(promises) {
  return new Promise((resolve, reject) => {
    const results = [];
    let count = 0;
    if (promises.length === 0) return resolve([]);

    promises.forEach((p, i) => {
      // Promise.resolve 包裹：兼容传入普通值
      Promise.resolve(p).then(
        (v) => {
          results[i] = v;          // 注意用索引赋值，保证顺序
          count++;
          if (count === promises.length) resolve(results);
        },
        reject                     // 任何一个失败立即整体 reject
      );
    });
  });
}
```

---

## 七、DOM 操作与事件委托

### 查询与修改

```js
// 查询
document.getElementById('x');
document.querySelector('.item');          // 第一个匹配
document.querySelectorAll('.item');        // NodeList（类数组，有 forEach）

// 创建与插入
const div = document.createElement('div');
div.textContent = '文本';                  // 安全：自动转义
div.innerHTML = '<b>HTML</b>';            // ⚠️ XSS 风险
parent.append(div);                        // 放最后
parent.prepend(div);                       // 放最前
el.before(div); el.after(div);             // 兄弟位置
el.replaceWith(div);
el.remove();

// 属性与样式
el.className = 'a b';
el.classList.add('a'); el.classList.remove('b'); el.classList.toggle('c');
el.setAttribute('data-id', '1');
el.dataset.id;                             // 读 data-id
el.style.color = 'red';                    // 行内样式
```

::: danger innerHTML 的 XSS 风险
```js
// ✗ 用户输入直接塞进 innerHTML → 可执行脚本
el.innerHTML = `<div>${userInput}</div>`;
// 用户输入 <img src=x onerror="alert(document.cookie)"> → 脚本执行

// ✓ 用 textContent（自动转义）
el.textContent = userInput;

// ✓ 必须插 HTML 时，先转义
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
el.innerHTML = `<div>${esc(userInput)}</div>`;
```
:::

### 事件流三阶段

```
捕获（capture，从外到内）→ 目标（target）→ 冒泡（bubble，从内到外）
```

```js
el.addEventListener('click', handler, false);  // 默认：冒泡阶段
el.addEventListener('click', handler, true);   // 捕获阶段
el.addEventListener('click', handler, { capture: true, once: true, passive: true });
```

### 事件委托（性能关键）

```js
// ✗ 给 1000 个 li 各绑一个事件 → 1000 个监听器
document.querySelectorAll('li').forEach(li => {
  li.addEventListener('click', handler);
});

// ✓ 只给父元素绑一个，靠冒泡 + target 判断
document.querySelector('ul').addEventListener('click', (e) => {
  const li = e.target.closest('li');    // 向上找最近的 li
  if (!li) return;
  console.log('点击了', li.dataset.id);
});
```

::: key 事件委托的三个好处
1. **性能**：1 个监听器代替 N 个
2. **动态元素**：新加的 li 自动生效，不需要重新绑
3. **内存**：卸载列表时不用逐个解绑

`e.target` 是真正点到的元素（可能是 li 里的 span），
`e.currentTarget` 是绑定监听器的元素。
`closest()` 向上找，比 `parentNode` 稳。
:::

### 阻止默认行为与冒泡

```js
a.addEventListener('click', (e) => {
  e.preventDefault();      // 阻止默认行为（跳转、表单提交）
  e.stopPropagation();     // 阻止冒泡（父元素不再收到）
  // e.stopImmediatePropagation();  // 连同级其他监听器也阻止
});
```

::: warn passive 与滚动性能
```js
el.addEventListener('touchmove', handler, { passive: true });
```
告诉浏览器"我不会调用 preventDefault"，浏览器就能立刻滚动而不等你执行完 JS。
在滚动/触摸事件上不加 `passive`，浏览器会警告并可能卡顿。
:::

---

## 八、模块化 ESM

```js
// utils.js —— 具名导出
export const PI = 3.14;
export function add(a, b) { return a + b; }
export default function () { }        // 默认导出（每个模块只能一个）

// main.js —— 导入
import def, { PI, add } from './utils.js';
import * as all from './utils.js';
import { add as plus } from './utils.js';

// 动态导入（返回 Promise，用于懒加载）
const mod = await import('./heavy.js');
```

::: key ESM vs CommonJS
| | ESM | CommonJS |
|---|---|---|
| 语法 | `import/export` | `require/module.exports` |
| 加载 | 静态（编译时确定依赖，可 tree-shaking） | 运行时 |
| 值 | **引用绑定**（活连接） | 值的拷贝 |
| 顶层 await | 支持 | 不支持 |
| 环境 | 浏览器 + Node | Node（浏览器需打包） |
:::

```js
// 浏览器里用 ESM 必须写 type="module"
<script type="module" src="./main.js"></script>
// 且路径要写全 .js 后缀，file:// 下还会被 CORS 拦住 → 必须走 http 服务器
```

---

## 九、深浅拷贝与防抖节流

### 深浅拷贝

```js
// 浅拷贝：只复制第一层，嵌套对象还是共享引用
const shallow1 = { ...obj };
const shallow2 = Object.assign({}, obj);
const shallow3 = arr.slice();

// ✗ 这些都不是深拷贝
const notDeep = { ...obj };       // 嵌套仍是引用

// 深拷贝
const deep1 = structuredClone(obj);      // ✓ 现代 API，推荐
const deep2 = JSON.parse(JSON.stringify(obj));  // ⚠️ 有坑
```

::: danger JSON 深拷贝的四个坑
```js
const o = {
  date: new Date(),           // → 变成字符串
  fn: () => {},               // → 丢失
  undef: undefined,           // → 丢失
  re: /abc/g,                 // → 变成 {}
  map: new Map(),             // → 变成 {}
  big: 9007199254740993n,     // → 报错（BigInt 无法序列化）
  cyclic: null,
};
o.cyclic = o;                 // → 循环引用，直接抛错
```
**用 `structuredClone`**（支持 Date/Map/Set/RegExp/循环引用，不支持函数）。
:::

手写深拷贝（面试常考）：

```js
function deepClone(obj, map = new WeakMap()) {
  // 原始类型直接返回
  if (obj === null || typeof obj !== 'object') return obj;

  // 处理循环引用
  if (map.has(obj)) return map.get(obj);

  // 处理特殊对象
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);

  // 创建同类型容器
  const clone = Array.isArray(obj)
    ? []
    : Object.create(Object.getPrototypeOf(obj));
  map.set(obj, clone);

  // 递归（Reflect.ownKeys 能拿到 Symbol 键）
  Reflect.ownKeys(obj).forEach((k) => {
    clone[k] = deepClone(obj[k], map);
  });
  return clone;
}
```

### 防抖（debounce）

::: key 语义
**事件停止触发 N 毫秒后才执行一次。** 适合：搜索框输入、窗口 resize。
:::

```js
function debounce(fn, delay = 300, immediate = false) {
  let timer = null;
  return function (...args) {
    const callNow = immediate && !timer;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!immediate) fn.apply(this, args);
    }, delay);
    if (callNow) fn.apply(this, args);
  };
}

// 用法
const onSearch = debounce((kw) => fetch('/api/search?kw=' + kw), 400);
input.addEventListener('input', (e) => onSearch(e.target.value));
```

### 节流（throttle）

::: key 语义
**固定间隔内最多执行一次。** 适合：滚动加载、拖拽、鼠标移动。
:::

```js
// 时间戳版（首次立即执行）
function throttle(fn, interval = 200) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}

// 定时器版（首次延迟执行，保证最后一次一定执行）
function throttle2(fn, interval = 200) {
  let timer = null;
  return function (...args) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, interval);
  };
}
```

| | 防抖 debounce | 节流 throttle |
|---|---|---|
| 触发时机 | 停止操作后 | 固定间隔 |
| 适合 | 搜索联想、表单校验 | 滚动加载、resize |
| 类比 | 电梯等人上齐再关门 | 地铁按时刻表发车 |

---

## 十、本节速查

```js
// 类型
typeof null === 'object'（bug）; Array.isArray();
Number.isNaN() 优于 isNaN(); 0.1+0.2 !== 0.3

// 作用域
var 函数作用域 + 提升; let/const 块级 + TDZ; const 内容可变

// 闭包：函数 + 定义时的词法环境；循环 var → let

// this 优先级：new > call/apply/bind > obj.fn() > 默认
// 箭头函数没有自己的 this/arguments/prototype，不能 new

// 原型链：f.__proto__ → Fn.prototype → Object.prototype → null

// 事件循环：同步 → 清空微任务 → 一个宏任务 → 循环
// 微任务：Promise.then、await 之后、queueMicrotask

// Promise：all（全成功）/ allSettled（等全部）/ race（最快）/ any（最快成功）

// 深拷贝：structuredClone；JSON 法丢 Date/函数/循环引用
// 防抖：停止后执行；节流：固定间隔执行

// 事件委托：父元素绑一次 + e.target.closest()
// 阻止：preventDefault（默认行为）/ stopPropagation（冒泡）
```

::: interview 面试高频
**Q：`for(var i=0;i<3;i++) setTimeout(()=>console.log(i))` 输出什么？怎么改？**
A：输出 3 3 3。var 是函数作用域共用同一个 i。改用 `let`，
或用 IIFE 传参，或用 `setTimeout` 第三个参数。

**Q：`0.1 + 0.2 === 0.3` 为什么是 false？**
A：IEEE 754 双精度浮点用二进制表示，0.1 和 0.2 都无法精确表示，
相加产生舍入误差。比较浮点要允许误差。

**Q：说清楚 `flex:1` 的展开？**
A：`flex-grow:1; flex-shrink:1; flex-basis:0%`。（这是 CSS 题，但常和 JS 一起问）

**Q：微任务和宏任务的区别？为什么要有微任务？**
A：宏任务之间浏览器可以渲染。微任务在本轮同步代码结束后、下一个宏任务前全部清空。
设计微任务是为了让 Promise 的回调"尽快但不打断当前同步代码"执行。

**Q：`async/await` 和 Promise 的关系？**
A：async 函数本质返回 Promise。`await` 后面的代码等价于 `.then()`，
所以是微任务。await 右边表达式仍同步执行。

**Q：深拷贝有哪几种，各自的问题？**
A：展开运算符/Object.assign 是浅拷贝；
`JSON.parse(JSON.stringify())` 丢 Date/undefined/函数/Symbol、不支持循环引用、BigInt 报错；
`structuredClone` 最全但丢函数。手写递归 + WeakMap 处理循环引用。
:::

---

## 延伸练习

1. 预测输出并解释：`console.log(1); setTimeout(()=>console.log(2)); Promise.resolve().then(()=>console.log(3)); console.log(4);`
2. 手写 `debounce` 和 `throttle`，要求都支持传参和 `this`。
3. 手写 `Promise.all`，要求空数组返回 `[]`，保持结果顺序。
4. 用闭包实现一个计数器，要求 `c1` 和 `c2` 互不影响。
5. 用事件委托给一个动态列表实现删除功能，要求新增的项自动生效。
6. 手写深拷贝，要求支持 Date、RegExp、数组、循环引用。

## 目录

- [1. 引入与使用](#1-引入与使用)
- [2. 功能 API](#2-功能-api)
- [3. 模板语法与表达式能力](#3-模板语法与表达式能力)
- [4. 指令详解](#4-指令详解)
- [5. 组件系统 `dom()`](#5-组件系统-dom)
- [6. 底层 API](#6-底层-api)
---

## 1. 引入与使用

### 1.1 引入
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>  <!-- ✔️ ① 直接引入构建产物 -->
</head>
<body>
</body>
<script type="module">
    import ridom from "ridom"; // ✔️ ② 按 ESM 模块引入
</script>
</html>
```
- `CDN` 直接引入构建产物
- `ESM` 引入需要在 `script` 标签里添加 `type="module"`，引入构建产物
-  ⚠️两种引入方式，**只能选择一种**

### 1.2 使用
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
</body>
<script>
    <!-- ✔️ 引入 Ridom 模块直接使用 API -->
    const { ref, reactive, watch, provide } = Ridom;
</script>
</html>
```

---

## 2. 功能 API

### 2.1 `ref(init)` — 基础类型

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div>{{ count }}</div>                      <!-- ✔️ 自动解包 -->
    <div>{{ count.value + 1 }}</div>            <!-- ✔️ 表达式运行必须写 .value -->
    <div r-click="count.value++">+1</div>       <!-- ✔️ 因为 r-click 里面执行的是 js 代码，所以必须写 .value -->
</body>
<script>
    const { ref } = Ridom;
    const count = ref(0);
    count.value = 1;
</script>
</html>
```

- 只能通过 `.value` 读写
- 模板里会自动解包：`{{ count }}` 与 `{{ count.value }}` 输出一样， **但事件表达式里必须写 `.value`**

**自动解包只发生在"表达式的最终结果"上**，把 ref 当参数传进函数不会解包：

```html
<p>{{ price }}</p>              <!-- ✔️ 12.5 -->
<p>{{ fmt(price) }}</p>         <!-- ❌ 页面原样显示 fmt(price) -->
<p>{{ fmt(price.value) }}</p>   <!-- ✔️ ￥12.50 -->
```

- 用 `const` 声明在 `<script>` 顶层的变量是全局变量，模板和 `r-click` 都能直接读到
- `ref` 的读写都会触发依赖收集，所以"全局 ref + 模板插值"就能跑起来，不需要 `r-data`

### 2.2 `reactive(target)` — 对象与数组

```html
<!DOCTYPE html>
<html lang="zh-CN">
    <head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div>{{ user.name }}</div>                      
    <div>{{ user.tags[0] }}</div>  
    <div>{{ user.tags }}</div>
    <button r-click="user.name = '李四'">修改姓名</button>   
    <button r-click="user.tags.push('b')">添加标签</button>
</body>
<script>
    const { reactive } = Ridom;
    const user = reactive({ name: "张三", tags: ["a"] });
    const date = reactive(new Date());      <!-- ⚠️ Date 不是纯对象会警告 -->
    const map = reactive(new Map());        <!-- ⚠️ Map 不是纯对象会警告 -->
</script>
</html>
```

- 只包装纯对象与数组，其他类型会警告
- 无需通过 `.value` 访问，因为 `reactive` 包装的是对象，可以直接操作对象的属性

### 2.3 `watch(source, callback, options)`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div>{{ count }}</div>
    <button r-click="count.value++">增加</button>
    <button r-click="stop1()">停止监听1</button>      <!-- ✔️ 调用 watch 监听器返回的函数可以停止监听 -->
    
    <p>{{ user.name }}</p>
    <p>{{ user.age }}</p>
    <button r-click="user.name='李四'">修改姓名</button>
    <button r-click="user.age++">修改年龄</button>
    <button r-click="stop2()">停止监听2</button>
</body>
<script>
    const { ref, reactive, watch } = Ridom;
    
    const count = ref(0);
    const stop1 = watch(() => count.value, (newVal, oldVal) => {
        console.log("count 变化了");
        console.log(`新值: ${newVal}, 旧值: ${oldVal}`);
    }, { immediate: true }); <!-- ✔️ immediate 设置立即触发一次 -->
    
    const user = reactive({ name: "张三", age: 18 });
    
    <!-- ✔️ 可通过数组监听多个响应式数据 -->
    const stop2 = watch(() => [user.name, user.age, count.value], ([newName, newAge, newCount], [oldName, oldAge, oldCount]) => {
        console.log("user.name 或 user.age 或 count.value 变化了");
        console.log(`user.name: ${oldName} -> ${newName}`);
        console.log(`user.age: ${oldAge} -> ${newAge}`);
        console.log(`count.value: ${oldCount} -> ${newCount}`);
    }, { once: true }); <!-- ✔️ once 设置触发后自动停止 -->
</script>
</html>
```

- `source` **必须是函数**
- `callback` **回调函数，当 `source` 返回值变化时触发**
- `immediate: true` 会在初始化时先跑一次回调
- `once: true` 触发一次后自动停止监听
-  ✔️ 可通过调用 `watch` 的返回值停止监听
-  ✔️ 可通过数组监听多个响应式数据
-  ⚠️ 同一帧内连续修改响应式数据，`callback` 只会触发次，而不是每次修改都触发一次

### 2.4 `provide(key, value)` — 注入根作用域

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <p>{{ apiBase }}</p>                <!-- ✔️ 字符串 -->
    <p>{{ theme }} / {{ lang }}</p>      <!-- ✔️ 对象批量注入 -->
    <p>{{ fmt(price.value) }}</p>        <!-- ✔️ 函数；参数要自己 .value -->
</body>
<script>
    const { ref, provide } = Ridom;

    provide("apiBase", "/api");                     // 单个注入
    provide({ theme: "dark", lang: "zh" });          // 对象批量注入
    provide("fmt", (n) => "￥" + n.toFixed(2));      // 函数注入

    const price = ref(12.5);
</script>
</html>
```

- 必须在 `start()` 之前调用（数据先攒在 `pendProv` 里，start 时才灌进 `rootScope`），
  写在 `<script src>` 之后的普通 `<script>` 里就正好赶上
- 数据成为 **根作用域**的属性 → 只有页面模板（`r-data` 之外的那层）看得见
- **组件模板看不到**（实测报 `ReferenceError`，页面显示原始表达式）
- 启动之后再 `provide` 不会生效，也不会报错（静默失效）

### 2.5 `onMounted(callback)` — 启动完成回调

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div id="chart" style="height:60px">图表占位</div>
    <p id="size">测量中…</p>
</body>
<script>
    const { onMounted } = Ridom;

    onMounted(() => {
        // ✔️ 此时 compile 已完成，可以量尺寸、初始化第三方库
        const h = document.getElementById("chart").offsetHeight;
        document.getElementById("size").textContent = "高度 " + h + "px";
    });

    onMounted(() => console.log("第二个回调也会执行，按注册顺序"));
</script>
</html>
```

- 只是"启动流程结束"的回调队列， **不是** DOM 加载事件：`start()` 会把它排进 `requestAnimationFrame`
- 执行后队列立刻清空（`mountCbs.length = 0`），所以 **只跑一次**，不会随路由重复触发
- 回调执行时模板已渲染完，适合做首屏测量、图表初始化、首次 `router.nav`

### 2.6 `raf(fn)` — 下一帧执行并取返回值

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div id="box" style="height:40px">内容</div>
</body>
<script>
    const { raf } = Ridom;

    // ✔️ 返回 Promise，await 能拿到 fn 的返回值
    raf(() => {
        const h = document.getElementById("box").offsetHeight;
        console.log("下一帧量到的高度:", h);
    });
</script>
</html>
```

- 用途：改完数据想立刻读渲染结果，框架的更新也排在下一帧
- ⚠️ 在 `dom()` 组件的 `script` 里 `await raf(...)` 会把 `script` 变成 async → `setup/mounted` 全部失效

### 2.7 `cpInsts` — 组件实例缓存

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-dom="card" $title="自定义标题" $my-name="自定义名称"></div>
</body>
<script>
    const { dom, cpInsts, ref } = Ridom;

    const Card = dom("card", {
        template: `
            <div>
                <p>{{ $props.title }}</p>
                <p>{{ n.value }}</p>
            </div>
        `,
      
        props: { 
            title: "默认标题",
            myName: "默认名称"
        },
      
        script: (_, { ref }) => {
            const n = ref(1);
            
            const setup = () => ({ n });
            
            return { setup };
        },
    });

    // ✔️ 可通过 cpInsts.get() 访问组件实例的内部作用域
    const host = document.getElementById("card");
    const scope = cpInsts.get(host);
    
    // ✔️ 可直接读取和修改组件实例的属性和方法
    scope.n.value = 100;
    console.log("修改后的 n.value:", scope.n.value);   // 100

    // ✔️ 可通过 shadowRoot 获取组件实例的 DOM 元素
    console.log(host.shadowRoot.querySelector("p"));
</script>
</html>
```

- 因为通过 `r-dom` 注册的组件没有返回值，所以只能通过 `cpInsts.get()` 访问组件实例的内部作用域
- ⚠️ `cpInsts.get(host)` 返回的是 **内部作用域对象**，不是 `dom()` 返回的实例；实例是作用域的浅拷贝 + `root/del`
- ⚠️ 在通过 `r-dom` 注册的组件传递参数时，遇到驼峰命名的属于一律采用短横线命名，`$my-age` 而不是 `$myAge`

---

## 3. 模板语法与表达式能力

### 3.1 文本插值

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <p>你好 {{ name }}</p>                                <!-- ✔️ 变量 -->
    <p>{{ count.value + 1 }} / {{ list.length }}</p>      <!-- ✔️ 算术与属性，ref 必须 .value -->
    <p>{{ user?.age ?? 0 }}</p>                           <!-- ✔️ 可选链 + 空值合并 -->
    <p>{{ ok ? "是" : "否" }}</p>                         <!-- ✔️ 三元 -->
    <p>{{ list.map(v => v.name).join("、") }}</p>         <!-- ✔️ 箭头函数 -->
  
    <p>{{ JSON.stringify({a: 1}) }}</p>                   <!-- ❌ 遇到 } 就截断，原样输出 -->  
    <p>{{ `共 ${list.length} 条` }}</p>                   <!-- ❌ 同上 -->
    <p>{{ list.map(v => { return v }) }}</p>              <!-- ❌ 同上 -->
</body>
<script>
    const { ref, reactive } = Ridom;
    const name = ref("张三");
    const count = ref(1);
    const ok = ref(true);
    const user = reactive({ age: 18 });
    const list = reactive([{ name: "苹果" }, { name: "香蕉" }]);
</script>
</html>
```

- 插值正则是 `/(\\)?\{\{([^}]+?)}}/g` —— **中间不能出现 `}`**
- 所以对象字面量、带花括号的箭头函数体、模板里嵌套对象都会截断；真要生成对象就用变量
- 表达式求值失败时 **静默回退成原文字符串**（页面显示 `user.name` 这几个字），控制台一条 `[parser] 解析错误`

### 3.2 属性插值

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
    <style>
        .on { color: #4f46e5; font-weight: 600; }
    </style>
</head>
<body>
    <a class="tab {{ cur.value === '/list' ? 'on' : '' }}" data-path="{{ cur.value }}"> <!-- ✔️ cur 参与运算都要加上 .value -->
      当前 {{ cur }}
    </a>
    <i style="color: {{ color }}">颜色</i>
    <button r-click="cur.value = '/stat'; color.value = 'red'">切换</button>
</body>
<script>
    const { ref } = Ridom;
    const cur = ref("/list");
    const color = ref("green");
</script>
</html>
```

- 任何属性值里的 `{{ }}` 都会被编译，`class` / `style` / `data-*` / 自定义属性都行
- **属性插值是响应式的**（挂在元素同一个 `update` 上），改 `cur` 后 `class` 会从 `on` 变成 `""`
- ⚠️ 点是 **整条属性覆盖**：别在同一个属性上再混用 `el.classList.add()`，下次刷新会被冲掉
- ⚠️ **不能**用插值给指令属性赋值，`r-if="{{ x }}"` 是错的，指令的属性值本身就是表达式

### 3.3 转义

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <p>\{{ 原样输出 }}</p>        <!-- ✔️ 输出：{{ 原样输出 }} -->
    <p>{{ n }}</p>               <!-- ✔️ 正常求值 -->
</body>
<script>
    const { ref } = Ridom;
    const n = ref(5);
</script>
</html>
```

- 反斜杠 `\{{` 表示"这段不解析"
- 实测输出是 `{{n}}` 这种 **去掉首尾空白** 的形式，只适合显示占位符，别指望格式完全不变

### 3.4 表达式里能写什么

表达式会被编译成 `new Function(...作用域键, "return " + expr)`，所以：

| 能力                              | 支持 | 说明                                             |
|-----------------------------------|------|--------------------------------------------------|
| 任意 JS 表达式                    | ✔️   | 三元、算术、逻辑、可选链                         |
| 全局对象 `Math` / `JSON` / `Date` | ✔️   | 函数体在全局作用域，能拿到                       |
| 自定义全局                        | ✔️   | 只要在 `window` 上（或 `<script>` 顶层 `const`） |
| 作用域里没有的变量                | ❌   | 抛 `ReferenceError`，回退成 **原文字符串**       |
| 赋值（`a = 1`）                   | ⚠️  | 只改形参，不回写作用域（见坑位 1）               |
| `await` / 语句块                  | ❌   | `return` 后面接的是表达式，不是语句块            |

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <p>{{ Math.round(price * 1.1) }}</p>          <!-- ✔️ Math 可用 -->
    <p>{{ new Date(2026, 0, 1).getFullYear() }}</p><!-- ✔️ Date 可用 -->
    <p>{{ JSON.stringify(tags) }}</p>              <!-- ✔️ JSON 可用 -->
    <p>{{ user.name }}</p>                        <!-- ❌ user 不存在 → 显示 "user.name" -->
</body>
<script>
    const { ref, reactive } = Ridom;

    const price = ref(100);
    const tags = reactive(["a", "b"]);
</script>
</html>
```

- **报错回退是静默的**，只在控制台留一条 `[parser] 解析错误`，页面上你会看到原始表达式
- 排查"页面怎么冒出一堆变量名"的第一入口就是这条日志

### 3.5 `parser` 手动用表达式引擎

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body></body>
<script>
    const { ref, parser } = Ridom;

    console.log(parser.parse("count + 1", { count: 1 }));                        // 2
    console.log(parser.parse("{{ count }}", { count: 1 }));                      // 2（自动去壳）
    console.log(parser.parse("count.value", { count: ref(3) }));                 // 3（自动解包）
    console.log(parser.text("共 {{ n }} 条", { n: 5 }));                         // "共 5 条"

    const deps = new Set();
    parser.parse("a + b.c", { a: 1, b: { c: 2 } }, deps);
    console.log([...deps]);                                                     // ["a", "b"]
</script>
</html>
```

- 第四个参数 `unwrapRef` 传 `false` 可以拿到 ref 本身，默认 `true` 会自动解包
- 第三个参数 `deps` 是"依赖收集容器"，集合里填的是 **根变量名**

---

## 4. 指令详解

| 指令      | 作用              | 表达式类型                  | 关键属性                                                             |
|-----------|-------------------|-----------------------------|----------------------------------------------------------------------|
| `r-data`  | 创建局部作用域    | 对象 / JSON 字符串 / 任意值 | 无                                                                   |
| `r-if`    | 条件渲染          | 布尔表达式                  | `del`                                                                |
| `r-for`   | 列表 / 数字循环   | 数组或数字                  | `index` `value` `key` `start`                                        |
| `r-model` | 双向绑定          | 数据路径                    | `type`                                                               |
| `r-click` | 事件绑定          | 语句/表达式                 | 裸事件名属性 + `keydown="enter"`                                     |
| `r-api`   | 声明式请求 + 渲染 | URL                         | `method` `list` `arr` `key` `refresh` `manual` `data-body` `headers` |
| `r-dom`   | 挂载组件          | 组件名                      | `$prop-name`                                                         |
| `r-route` | 路由跳转          | 路径                        | `route-active`                                                       |

### 4.1 `r-data` 局部数据作用域

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Ridom</title>
  <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
  <div r-data="{ count: 0, user: { name: '张三' }, tags: ['a', 'b'] }">
    <p>{{ count }} / {{ user.name }} / {{ tags.length }}</p>

    <button r-click="count = 5">count = 5</button>          <!-- ❌ 无效：只改了形参 -->
    <button r-click="count++">count++</button>              <!-- ❌ 无效：同上 -->

    <button r-click="this.count = 5">this.count = 5</button><!-- ✔️ 有效，this 指向作用域 -->
    <button r-click="this.count++">this.count++</button>    <!-- ✔️ 有效，this 指向作用域 -->

    <button r-click="user.name = '李四'">改用户</button>     <!-- ✔️ 有效：形参是引用 -->
    <button r-click="tags.push('c')">加标签</button>         <!-- ✔️ 有效：形参是引用 -->
  </div>
</body>
<script>
  // 这里不需要任何代码，数据全部由 r-data 表达式提供
</script>
</html>
```

**表达式支持三种形态**：

| 表达式                 | 结果                    | 用法                      |
|------------------------|-------------------------|---------------------------|
| 对象字面量             | 直接当作用域            | 最常见                    |
| JSON 字符串            | `JSON.parse` 后当作用域 | `r-data='{"count":0}'`    |
| 其它（数字/布尔/null） | 包装成 `{ data: 值 }`   | 模板里用 `{{ data }}`     |

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-data='{"count": 3}'>              <!-- ✔️ JSON 字符串 -->
        <b>{{ count }}</b>
    </div>

    <div r-data="42">                        <!-- ⚠️ 非对象，被包成 { data: 42 } -->
        <b>{{ data }}</b>
    </div>
</body>
</html>
```

**嵌套继承**：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-data="{ n: 5 }">
        <div r-data="{ inner: 9 }">
            <b>{{ inner }} | {{ n }}</b>     <!-- ✔️ 输出 9 | 5，沿原型链找到 n -->
        </div>
        <button r-click="this.n++">n++</button>
    </div>
</body>
<script>
    const { onMounted, raf } = Ridom;
        
    const scope = document.querySelector("[r-data]");
        
    onMounted(() => {
        console.log(scope._data);
        scope._data.n++; <!-- ✔️ 可通过 _data 修改数据 -->
    });
</script>
</html>
```

- 原始值（数字/字符串/布尔）：**必须 `this.x`**
- 对象/数组：形参拿的是 **引用**，`user.name = ...`、`tags.push(...)` 直接有效
- 可通过 `_data` 修改数据，当必须要等 DOM 渲染完成后再修改时，才需要使用 `_data`
-  ⚠️ `_data` 是内部字段，能用但不建议依赖

### 4.2 `r-if` — 条件渲染

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-data="{ loading: true, error: '', tab: 'edit' }">
        <button r-click="this.loading = !this.loading">切换 loading</button>
        <button r-click="this.tab = this.tab === 'edit' ? 'view' : 'edit'">切换 tab</button>

        <div r-if="loading">加载中…</div>                  <!-- ✔️ 默认模式：display:none -->

        <div r-if="error" del>出错了：{{ error }}</div>     <!-- ✔️ del 模式：真销毁 -->

        <div r-if="tab === 'edit'" del>
            <input placeholder="切走再回来，这里会被清空">
        </div>
        <div r-if="tab === 'view'">
            <article>只读视图</article>
        </div>
    </div>
</body>
</html>
```

两种模式，**默认是"隐"不是"删"**：

| 写法              | 假值时                      | 恢复时                               | 适合                                         |
|-------------------|-----------------------------|--------------------------------------|----------------------------------------------|
| `r-if="expr"`     | `display: none !important`  | 改回原 `display`                     | 频繁切换、状态要保留（输入框内容、滚动位置） |
| `r-if="expr" del` | 从 DOM 移除 + 反订阅 + 释放 | 还原模板 → 重新编译 → 重新插入原位置 | 重内容、要被回收、要"重置状态"               |

### 4.3 `r-for` — 列表渲染

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <ul r-for="list">                          <!-- ✔️ 容器是 ul，模板是子节点 li -->
        <li>{{ value }} — #{{ index }}</li>
    </ul>

    <ol r-for="total" index="i" start="1">     <!-- ✔️ 数字循环，i 从 1 开始 -->
        <li>第 {{ i }} 页</li>
    </ol>
</body>
<script>
    const { reactive, ref } = Ridom;

    const list = reactive(["苹果", "香蕉", "橙子"]);
    const total = ref(3);

    // 3 秒后改数据，观察增量更新
    setTimeout(() => list.push("西瓜"), 3000);
</script>
</html>
```

| 属性    | 默认    | 含义                              |
|---------|---------|-----------------------------------|
| `index` | `index` | 索引变量名                        |
| `value` | `value` | 值变量名                          |
| `key`   | `id`    | 对象数组的唯一标识字段            |
| `start` | `0`     | 索引偏移，数字循环做"从 1 开始"   |

-  ⚠️ 克隆的是容器的子节点，容器元素本身不参与克隆 
- 容器上的 `class` / `style` / 自定义属性 **留在容器上**，不会复制到每个条目 
- 每个条目是"克隆出来的裸子节点"，**没有额外包裹元素**
- `r-for` / `index` / `value` / `key` / `start` / `shallow` / `class` / `style` 这 8 个属性不会被当成普通属性下发

#### 对象数组 + 自定义 key

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <ul r-for="users" key="uid">                <!-- ✔️ 用 uid 而不是默认的 id -->
        <li>{{ value.name }}（{{ value.uid }}）</li>
    </ul>

    <button r-click="users.reverse()">倒序</button>   <!-- ✔️ 节点复用，不重建 -->
    <button r-click="users.push({ uid: 3, name: '王五' })">加一个</button>
</body>
<script>
    const { reactive } = Ridom;

    const users = reactive([
        { uid: 1, name: "张三" },
        { uid: 2, name: "李四" },
    ]);
</script>
</html>
```

#### 嵌套做二维结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-for="9" index="i" start="1">                     
        <div r-for="i" index="j" start="1">        
            {{ j }} * {{ i }} = {{ i * j }} &nbsp;&nbsp;
        </div>
    </div>
</body>
</html>
```

### 4.4 `r-model` — 双向绑定

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-data="{ name: '张三', age: 18, agree: false, gender: 'a', city: 'bj', desc: '' }">
        <p>
            <input r-model="name" placeholder="文本">                    <!-- ✔️ text -->
            <input type="number" r-model="age" placeholder="数字">       <!-- ✔️ number -->
            <input type="range" min="0" max="100" r-model="age">         <!-- ✔️ range -->
            <input type="checkbox" r-model="agree"> 同意                 <!-- ✔️ checkbox -->
            <textarea r-model="desc" placeholder="多行"></textarea>      <!-- ✔️ textarea -->
        </p>

        <p>
            <label><input type="radio" name="g" value="a" r-model="gender"> A</label>
            <label><input type="radio" name="g" value="b" r-model="gender"> B</label>
            <select r-model="city">
                <option value="bj">北京</option>
                <option value="sh">上海</option>
            </select>
        </p>

        <p>{{ name }} / {{ age }} / {{ agree }} / {{ gender }} / {{ city }}</p>
        <p>desc: {{ desc }}</p>
    </div>
</body>
</html>
```

**控件矩阵**：

| 控件                           | 事件     | 模型值类型       | 说明                                   |
|--------------------------------|----------|------------------|----------------------------------------|
| `text` / `textarea` / `search` | `input`  | `string`         | 每次输入都同步                         |
| `number` / `range`             | `input`  | `number`         | 用 `valueAsNumber`，`NaN` 时回退字符串 |
| `checkbox`                     | `change` | `boolean`        | 只支持布尔，**不支持数组多选**         |
| `radio`                        | `change` | 选中项的 `value` | 取消选中时跳过写入                     |
| `select` / `select[multiple]`  | `change` | `string`         | 多选只取 `.value`（第一个）            |

#### 搜索框实时过滤

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-data="{ kw: '', list: ['苹果', '香蕉', '橙子'] }">
        <input r-model="kw" placeholder="搜索">          <!-- ✔️ kw 不需要 this. -->
        <div r-for="list" value="item">
            <p r-if="item.includes(kw)">{{ item }}</p>
        </div>
    </div>
</body>
</html>
```

- ⚠️ 这里 `kw` 是 `r-data` 的原始值，`r-model` 却 **能写回去**——因为它走 `setVal → scope[key] = v`，
  不是事件表达式的形参，所以搜索框是 `r-data` 里少数"不需要 `this`"的写入口

#### 两个控件绑同一个 key

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div>
        <input type="range" min="0" max="100" r-model="n">   <!-- ✔️ 滑杆 -->
        <input type="number" min="0" max="100" r-model="n">  <!-- ✔️ 数字框，双向联动 -->
        <b>{{ n }}</b>
    </div>
</body>
<script>
    const { provide, ref } = Ridom;
    
    const n = ref(30);
    provide({ n }); <!-- 绑定全局定义的数据需使用 provide 注入全局 -->
</script>
</html>
```
-  ⚠️ 在绑定全局模型时，要确保模型在 `provide` 之前定义，否则会报错
-  ✔️  在 `r-data` 和 `dom()` 中使用模型时，无需使用 `provide` 进行注入，直接使用即可

### 4.5 `r-click` — 事件绑定

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <!-- ✔️ 默认就是 click -->
    <button r-click="alert('点击')">普通点击弹窗</button>  
    <hr/>
  
    <!-- ✔️ 裸事件名换事件 -->
    <button r-click="alert('右键')" contextmenu>右键菜单弹窗</button>   
    <button r-click="alert('移入')" mouseover>鼠标移入弹窗</button>
    <hr/>
  
    <!-- ✔️ 按键过滤 -->
    <input r-click="alert('回车')" keydown="enter" placeholder="按回车弹窗">   
    <input r-click="alert('Esc')" keydown="esc" placeholder="按 Esc弹窗">
    <form r-click="alert('提交')" submit>
        <button type="submit">提交表单弹窗</button>
    </form>
    <hr/>

    <div r-data="{ msg: '初始值' }">
        <p>{{ msg }}</p>
        <button r-click="this.msg = '改过了'">改 r-data 的原始值</button>
    </div>
    <hr/>

    <!-- ✔️ $e 就是本次触发的事件对象 -->
    <button r-click="alert($e.type)">看事件类型</button>
    <button r-click="alert($e.target.tagName)">看触发元素</button>
    <input r-click="alert('按了 ' + $e.key)" keydown="enter" placeholder="回车看按键">
    <div r-data="{ list: [1, 2, 3] }">
        <ul r-for="list">
            <li><button r-click="alert($e.type + ' / ' + value)">条目内也能拿到 $e</button></li>
        </ul>
    </div>
</body>
</html>
```

- JS 原生事件都支持
- `$e` 恒等于本次触发的事件对象，18 种事件都注入，`$e.target` / `$e.key` / `$e.clientX` 随便读
- `$e` 是**保留名**：作用域里就算有个叫 `$e` 的键也会被让位，保证它永远是事件
- ❌ `e` 和 `$event` 都不是它：`r-click="fn(e)"` 会报 `ReferenceError: e is not defined`
- ⚠️ 老写法 `window.event` 仍能用，但它只在同步派发期间有值，`await` / `setTimeout` 之后就是 `null`，新代码统一用 `$e`
- ⚠️ **一个元素只能挂一种事件**：HTML 不允许同名属性重复，`r-click` 只会命中 `EVENT_MAP` 里
- **第一个**匹配的裸属性（顺序是 `click → dblclick → …`）。多种事件请用嵌套元素，各自挂一个。

### 4.6 `r-api` — 声明式请求

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <!-- 响应体本身就是数组 -->
    <div r-api="https://jsonplaceholder.typicode.com/posts">
        <span>{{ value.userId }}</span>
    </div>

    <!-- 响应体是 { code, data: [...] }，用 list 取顶层字段 -->
    <div r-api="https://ec.cxfjh.cn/api/is" list="data">
        <p>{{ value.message }}</p>
    </div>

    <!-- arr 模式：模板只编译一次，数据交给 r-for 做 diff -->
    <div r-api="https://jsonplaceholder.typicode.com/posts" arr="items" manual refresh="#reload">
        <p r-if="!items">还没有数据</p>
        <div r-for="items"><p>{{ value.title }}</p></div>
    </div>
    <button id="reload">重新请求</button>
</body>
</html>
```

| 属性          | 默认                                  | 说明                                                                |
|---------------|---------------------------------------|---------------------------------------------------------------------|
| `r-api="url"` | 必填                                  | 以 `/` 开头当字面量，否则当 **表达式** 求值                         |
| `method`      | `GET`                                 | `POST/PUT/PATCH` 才带 body                                          |
| `data-body`   | `{}`                                  | 请求体（表达式），`JSON.stringify` 后发                             |
| `headers`     | `{'Content-Type':'application/json'}` | 表达式，返回对象                                                    |
| `list`        | 无                                    | 从响应体里取 **顶层字段** 作为数据（`resData[list]`，**不是路径**） |
| `arr`         | 无                                    | 把数据放进作用域的这个变量名，模板里用 `r-for` 自己渲染             |
| `key`         | `id`                                  | 数组项的 key 字段                                                   |
| `refresh`     | 无                                    | 一个选择器，给该按钮绑"重新请求"                                    |
| `manual`      | 无                                    | 不自动请求，等刷新按钮                                              |

**三种渲染策略**：

| 数据       | 行为                                                      |
|------------|-----------------------------------------------------------|
| 数组       | 每项一个模板实例，key 复用，支持纯追加快路径              |
| 对象       | 单实例，整个对象作为 `value`                              |
| `arr` 模式 | 只编译一次模板，把数据塞进作用域变量，靠 `r-for` 增量渲染 |

**加载态**：模板里可以用 `_manual`，它的值其实就是 `loaded`：

```html
<div r-api="/api/list.json" arr="items" list="data">
    <p r-if="!_manual">加载中…</p>          <!-- ✔️ 首次请求期间 loaded=false -->
    <span r-for="items">{{ value.title }}</span>
</div>
```

- ⚠️ 这个名字有误导性：`_manual` 存的是 `loaded`（**请求成功/失败之后** 变 `true`），
  所以"加载中"是 `!_manual`，不是 `_manual`。更稳的写法是直接判数据：`r-if="!items"`

**手动触发**：

```html
<button id="reload">刷新</button>
<div r-api="/api/list.json" arr="items" list="data" manual refresh="#reload">…</div>
```

- `refresh` 用 `document.querySelector` 全局查找，元素必须已存在
- `manual` 模式下 **没有** `refresh` 就没有任何入口（初始内容会被清空，永远是空白）

### 4.7 `r-dom` — 组件挂载

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <!-- ✔️ props 是表达式：字符串加引号，数字直接写，变量直接引用 -->
    <div r-dom="user-card" $title="'个人信息'" $age="18"></div>

    <!-- ⚠️ 裸字符串会被当成变量，报 ReferenceError 后回退成字符串（功能正常，控制台脏） -->
    <div r-dom="user-card" $title="标题"></div>

    <div r-data="{ me: { name: '张三' } }">
        <!-- ✔️ 引用作用域变量 -->
        <div r-dom="user-card" $title="me.name" $age="30"></div>
    </div>
</body>
<script>
    const { dom } = Ridom;

    dom("user-card", {
        template: `
            <div class="card">
                <h3>{{ $props.title }}</h3>
                <p>{{ $props.age }} 岁</p>
            </div>
        `,
      
        style: `
            .card { 
                padding: 8px; 
                border: 1px solid #ddd; 
                margin: 6px 0; 
            }
        `,
      
        props: { 
            title: "默认标题", 
            age: 0 
        },
    });
</script>
</html>
```

- `r-dom` 的值是 **组件名**（`dom(name, ...)` 的 `name`）
- `$xxx` 属性是 props，属性名里的 `-` 会转成小驼峰（`$user-name` → `userName`）
- **props 的值是表达式**，所以字符串要加引号
- 宿主元素就是组件挂载点 `to` 直接传该元素
- 首次渲染排队在 `setTimeout` 微任务之后
- `$xxx` 变化会 **重新渲染组件**

### 4.8 `r-route` — 路由导航

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
    <style>
        .on { 
          color: #4f46e5; 
          font-weight: 600;
        }
        
        .route-page { 
          padding: 8px 0;
        }
    </style>
</head>
<body>
    <div r-app>
        <nav>
            <!-- ✔️ 裸字面量：src 会报一条正则告警，但只有这样 route-active 才生效 -->
            <a r-route="/home" route-active="on">首页</a>
            <a r-route="/about" route-active="on">关于</a>
        </nav>

        <div route="main"></div>   <!-- ✔️ 容器，初始化时会被清空 -->

        <template r-page="/home" &route="main">
            <h1>首页</h1>
            <p>这里是首页</p>
        </template>
        <template r-page="/about" &route="main">
            <h1>关于</h1>
            <p>这里是关于</p>
        </template>
    </div>
</body>
<script>
    const { router, onMounted } = Ridom

    // r-page 已经自动注册路由（handler 是空函数），这里只需要决定首次进入哪一页
    onMounted(() => {
      const path = new URL(location.href).searchParams.get("path");
      router.nav(path || "/home", true);
    });
</script>
</html>
```

- 点击时 `preventDefault()`，然后 `router.nav(path)`
- 路径 **必须是已注册路由**，否则只 warn（`路由不存在: /home`）
- 激活类默认 `r-active`，可以用 `route-active="xxx"` 换成自定义类名
- 元素被移除时自动解绑并注销

| 写法                        | 跳转 | `r-active` / `route-active` | 控制台                                         |
|-----------------------------|------|-----------------------------|------------------------------------------------|
| `r-route="/home"`           | ✔️   | ✔️                          | 一条 `SyntaxError: Invalid regular expression` |
| `r-route="'/home'"`         | ✔️   | ❌ **永远不高亮**           | 干净                                           |
| `r-route="curPath"`（变量） | ✔️   | ❌ 原始属性是 `curPath`     | 干净                                           |

## 5. 组件系统 `dom()`

### 5.1 完整签名

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div id="app"></div>
</body>
<script>
    const { dom, ref, onMounted } = Ridom;

    const Card = dom("card", {
        // ✔️ 必填模板字符串
        template: `
            <div class="card">
                <h3>{{ $props.title }}</h3>
                <p>计数 {{ count.value }}</p>
                <button r-click="count.value++">增加</button>
            </div>
        `,

        // ✔️ 可选组件样式，默认走 Shadow DOM，天然隔离
        style: `
            .card { 
                padding: 12px; 
                border: 1px solid #ddd; 
                border-radius: 6px; 
            }
        `,

        // ✔️ 可选 props 默认值
        props: { 
            title: "默认标题"
        },

        // ✔️ 可选逻辑与生命周期，第二个参数是工具集 ref, reactive, provide, watch, dom, cpInsts, router, raf 等
        script: ({ $props, $refs, $sty }, { ref }) => {
            const count = ref(0);
            
            return {
                setup: () => ({ count }),               // 暴露给模板
              
                mounted() { 
                    console.log("挂载完成:", $props.title); 
                },
              
                unmounted() { 
                    console.log("即将销毁"); 
                },
            };
        },

        // ✔️ 可选是否样式隔离，默认 true
        sty: true,

        // ⚠️ 可选写了 to 就是"定义即挂载"，不写则返回工厂函数
        // to: ["#app"],
    });

    // 因为没写 to，Card 是工厂函数，调用时才挂载
    const inst = Card({ to: ["#app"], props: { title: "你好" } });

    onMounted(() => console.log("实例:", inst.$compName, inst.$compId));
</script>
</html>
```

返回值有两种：

| 情况        | 返回         | 说明                              |
|-------------|--------------|-----------------------------------|
| 定义了 `to` | **实例对象** | 已经挂载，直接能 `.del()`         |
| 没定义 `to` | **工厂函数** | 调 `Card({ to, props })` 得到实例 |

- ⚠️ 组件名全局唯一，重复定义会打 `[dom] 组件名 "xxx" 已被占用`
- ⚠️ 工厂函数不传 `to` 会 `console.error("...缺少 to 参数")`，不会静默失败

### 5.2 实例对象

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <button id="kill">销毁组件</button>
</body>
<script>
    const { dom, ref } = Ridom;

    const Card = dom("card", {
        template: `<div class="card"><h3 ref="title">{{ $props.title }}</h3></div>`,
        props: { title: "默认标题" },
        script: () => ({ setup: () => ({ n: ref(0) }) }),
    });

    // to 指向一个不存在的 #card → 框架自动创建宿主
    const inst = Card({ to: ["#card"], props: { title: "你好" } });

    console.log(inst.$props.title);   // "你好"
    console.log(inst.$refs);          // { title: <h3> }（mount 之后才有值）
    console.log(inst.$compName);      // "card"
    console.log(inst.$compId);        // "comp-card-xxxx"
    console.log(inst.$sty);           // true
    console.log(inst.root());         // 模板根元素 <div class="card">

    document.getElementById("kill").onclick = () => inst.del();   // ✔️ 销毁（幂等）
</script>
</html>
```

### 5.3 样式隔离

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
    <style>
        .box { border: 2px dashed #f00; padding: 4px; }   /* 页面样式：只加边框，不碰颜色 */
    </style>
</head>
<body>
    <div id="shadow-one"></div>   <!-- sty: true（默认） -->
    <div id="light-one"></div>    <!-- sty: false -->
</body>
<script>
    const { dom } = Ridom;

    const ShadowBox = dom("shadow-box", {
        template: `<div class="box">隔离组件的文字</div>`,
        style: `.box { color: green; }`,
        sty: true,                                   // ✔️ 默认值，Shadow DOM
    });

    const LightBox = dom("light-box", {
        template: `<div class="box">不隔离组件的文字</div>`,
        style: `.box { color: green; }`,
        sty: false,                                  // ⚠️ light DOM，样式注进 <head>
    });

    ShadowBox({ to: ["#shadow-one"] });
    LightBox({ to: ["#light-one"] });
</script>
</html>
```

- `sty: true`（默认）→ 挂 Shadow DOM，样式走 `adoptedStyleSheets`，同名组件共享同一份 CSSOM
- `sty: false` → 挂 light DOM，样式注入一个全局 `<style>`（同名组件只注入一次）
- 上面这个例子里：**两个都是绿字**（各自 `style` 生效），但页面的**红色虚线边框只出现在 light 那个**上 ——
  这就是"页面 CSS 选不到组件内部"的直观体现
- 需要"外部能改组件样式"，要么 `sty: false`，要么用 CSS 变量：

```html
<style>
    #card-host { --card-bg: #fff; }     /* ✔️ CSS 变量能从宿主继承进 shadow */
</style>
<div id="card-host"></div>
```

```js
// 组件内
style: `.card { background: var(--card-bg, #f5f5f5); }`
```

### 5.4 `to` 的写法只有数组一种

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div id="app">
        <div id="main"></div>          <!-- 已存在，组件会追加在里面 -->
    </div>
</body>
<script>
    const { dom, onMounted } = Ridom;

    const Tip = dom("tip", {
        template: `<span style="color:#4f46e5">我是组件</span>`,
    });

    onMounted(() => {
        Tip({ to: ["#app"] });                  // ✔️ #app 里追加一层 slot
        Tip({ to: ["#app", "#main"] });         // ✔️ #app 下的 #main（已存在）
        Tip({ to: ["#app", "#side"] });         // ✔️ #side 不存在 → 自动创建
        Tip({ to: [".panel"] });                // ✔️ class 段 → 自动创建 div.panel
    });
</script>
</html>
```

| 情况                                  | 行为                                                                        |
|---------------------------------------|-----------------------------------------------------------------------------|
| 整条路径都命中                        | 渲染进末级元素                                                              |
| 中间某级缺失                          | 自动创建（`#id` → `div#id`，`.cls` → `div.cls`，标签名 → 该标签）           |
| 末级**本次新建**                      | 直接渲染进它（不套壳），`del()` 会把整个容器删掉                            |
| 末级**原本已存在**                    | 内部追加 `<div data-comp="组件名">` 承载，原内容不动，`del()` 只删这个 slot |
| 中间级是**组件宿主**（有 shadowRoot） | 查找和创建都进它的 shadowRoot（否则挂到 light DOM 会看不见）                |
| 传字符串 / 数字 / 元素                | **抛错**：`to 只接受数组写法…`                                              |

- 段只支持三种：`#id`、`.class`、标签名；其它写法会抛"无法自动创建"
- 想让容器活着又不想被 `del()` 删掉，就往里塞一层空 `<div>`，`to` 指向它

### 5.5 父子组件通信的三种做法

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div id="a"></div>
    <div id="b"></div>
    <div id="c"></div>
</body>
<script>
    const { dom, reactive, onMounted } = Ridom;

    const store = reactive({ count: 0 });          // ③ 横向共享的 reactive 对象

    const Child = dom("child", {
        template: `
            <div>
                <b>{{ $props.store.count }}</b>
                <button r-click="$props.onSave('新值')">向上传值（回调 props）</button>
                <button r-click="$props.store.count++">横向共享 store</button>
            </div>`,
        props: { onSave: () => {}, store: null },
    });

    // ② 向上：父组件把回调当 props 传下去
    const onSave = (v) => console.log("父组件收到:", v);

    onMounted(() => {
        Child({ to: ["#a"], props: { onSave, store } });   // ✔️ ① 向下：props
        Child({ to: ["#b"], props: { onSave, store } });   //    两个实例共享同一个 store
        Child({ to: ["#c"], props: { onSave, store } });
    });
</script>
</html>
```

- **向下**：`props`
- **向上**：把回调当 props（`onSave` 就是父组件给的函数）
- **横向**：多个组件拿到同一个 `reactive` 对象
- 组件模板里访问 props 一律写 `$props.xxx`（props 不会摊平到作用域顶层）
- ⚠️ 没有 `emit` / `slot` / `provide-inject` 这一套。`<slot>` 写了也不会生效（宿主 light DOM 是空的）

### 5.6 在组件里挂子组件

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-app>
        <div r-dom="parent"></div>
    </div>
</body>
<script>
    const { dom } = Ridom;

    const Child = dom("kid", { template: `<b>我是子组件</b>` });

    dom("parent", {
        // ✔️ 方案一：模板里用 r-dom（推荐，生命周期由框架管）
        template: `
            <div class="parent">
                父组件
                <div r-dom="kid"></div>
            </div>`,
    });
</script>
</html>
```

```js
// 方案二：mounted 里手动挂（从父组件自己的模板里拿容器）
dom("parent2", {
    template: `<div class="parent"><div id="slot"></div></div>`,
    script: () => ({
        mounted() {
            Child({ to: ["#slot"] });   // ✔️ mounted 时模板已进 shadow，能找到 #slot
        },
    }),
});
```

三种时机的实测结果：

| 时机                                     | 结果                                                                 |
|------------------------------------------|----------------------------------------------------------------------|
| `mounted` 里挂                           | ✔️ 落在父组件的 shadowRoot 内（`#slot` 里出现 `<div data-comp="kid">`） |
| `script` 里挂                            | ❌ 此时模板还没插进 shadow，`#slot` 会被创建到 `document.body`，子组件跑到页面末尾 |
| 模板里 `r-dom="kid"`                     | ✔️ 正常（`r-dom` 会回退到 `rootScope` 找组件工厂）                   |
| `start()` 之前手动调工厂 + 组件里有 `r-dom` | ⚠️ `rootScope` 还没建，`r-dom` 找不到组件名，**静默不渲染**（不报错）   |

- 手动 `Child({ to })` 可以在任何时候调，但 **`r-dom` 依赖 `rootScope`**，所以要放在 `r-app` 里或 `onMounted` 之后
- 如果确实要在 light DOM 里插节点，得 `el.shadowRoot.appendChild(x)`，直接往宿主 `appendChild` 是看不见的（没有 `<slot>`）
---

## 6. 底层 API

这些 API 平时不用，但 **做二次封装、写自定义指令、动态注入 HTML** 时是必需的。

### 6.1 `compile(el, scope)` — 手动编译

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-app><p>{{ msg }}</p></div>
    <button id="add">插入一段 HTML</button>
</body>
<script>
    const { ref, onMounted, compile } = Ridom;

    const msg = ref("hello");
    
    document.querySelector("#add").addEventListener("click", () => {
        document.body.insertAdjacentHTML(
            "beforeend",
            `<div id="x"><span>{{ msg }}</span></div>`
        );
        
        compile(document.querySelector("#x"));
    });
</script>
</html>
```

### 7.2 `bind(el, scope)` — 只绑一个元素

```js
const update = Ridom.bind(el, scope);
update();      // ✔️ 手动跑一次

Ridom.bind(el, scope) === update;   // ✔️ true，同一元素返回同一个函数（有缓存）
```

- 返回的 `update` 会缓存（同一元素只编译一次）
- 想"重新编译"要先 `delete el.__processed`，再 `compile`

### 7.3 `bindText(node, scope)` — 绑文本节点

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
</body>
<script>
    const { ref, bindText } = Ridom;
    
    const n = ref(0);
    const m = ref(1);
    
    const text = document.createTextNode("{{ n }} + {{ m }}");
    document.body.appendChild(text);
    
    bindText(text);   // ✔️ 之后 n 和 m 变化会更新这个文本节点
</script>
</html>
```

- ⚠️ 它 **不返回** update 函数（内部执行一次 + 登记到 `r-for` 的收集上下文）
- 清理挂在父元素上：父元素被移除时自动反订阅

### 7.4 `regDir(name, handler)` — 自定义指令

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Ridom</title>
    <script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>
</head>
<body>
    <div r-app>
        <input r-focus="true" placeholder="我会自动聚焦">
        <input r-focus="false" placeholder="我不会">
    </div>
</body>
<script>
    const { regDir, parser } = Ridom;

    // ✔️ 必须在元素被编译前注册
    regDir("r-focus", (el, expr, scope, deps) => {
        if (el.__focusProcessed) return;       // ✔️ 自己也要防重复
        el.__focusProcessed = true;

        if (parser.parse(expr, scope, deps)) el.focus();
    });
</script>
</html>
```

- 指令处理器会被 **每次更新** 重跑一次（在 `update()` 里循环所有指令），所以内部要自己做幂等
- `deps` 是"变量名集合"，填进去的键会在元素移除时被用来反订阅（`elDeps`）
- 想参与"父级数据变化时重算"，就在处理器里 `parser.parse(...)`，它会自动订阅
- 元素移除时用 `Ridom.onElRemove(el, fn)` 注册清理
- **必须在元素被编译前注册**（`regDir` 之后再插 DOM / 再 `compile`）

### 7.5 `onElRemove(el, cleanup)` — 元素移除回调

```js
Ridom.onElRemove(el, () => console.log("被移除了"));
```

- 底层是一个 `MutationObserver(document, { childList, subtree })`，**异步合批**（`setTimeout` 0）
- 回调执行时机：元素已脱离文档之后的一个 tick（不是同步）
- 所以"移除元素后立刻检查 DOM"可能还没清理完，要 `await` 一帧（`Ridom.raf(() => 0)`）

### 7.6 `Dep` / `activeFns` — 手写一个响应式绑定

```js
const dep = new Ridom.Dep();
dep.subscribe(fn, "name");     // 具名订阅
dep.notify("name");            // 只通知这个键的订阅者
dep.notify();                  // 全量通知
dep.unsubscribe(fn, "name");
```

```js
// 手写"读取即订阅"
Ridom.activeFns.push(myUpdateFn);
try {
    state.count;               // 这次读取会把 myUpdateFn 订阅到 count
} finally {
    Ridom.activeFns.pop();
}
```

#### 其他用法：包一个"自定义数据源"

```js
const dep = new Ridom.Dep();
let value = 0;

const external = {
    get value() {
        dep.subscribe(Ridom.activeFns.at(-1));   // 谁在读我，就订阅谁
        return value;
    },
    set value(v) {
        value = v;
        dep.notify();
    },
};
```

### 7.7 `batch` — 批量更新

```js
Ridom.batch.add(fn);        // ✔️ 下一帧执行，同一帧多次 add 只跑一次
Ridom.batch._execute();     // ✔️ 立即清空队列（测试用）
```


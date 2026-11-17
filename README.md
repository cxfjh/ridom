<div>
  <h1>Ridom</h1>
  <p>
    <strong>轻量级、高性能的响应式 DOM 框架，</strong>gzip 仅 <strong>13 KB</strong>，<strong>零依赖</strong>，无需构建工具即可运行
  </p>
</div>
<br />
<div>
  <a href="./package.json"><img src="https://img.shields.io/badge/version-0.1.0-4f46e5?style=flat-square" alt="version 0.1.0" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/gzip-13%20kB-10b981?style=flat-square" alt="gzip 13 kB" /></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/dependencies-0-10b981?style=flat-square" alt="零运行时依赖" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-475569?style=flat-square" alt="MIT License" /></a>
  <a href="./docs/GUIDE.md"><img src="https://img.shields.io/badge/reactivity-Proxy-4f46e5?style=flat-square" alt="Proxy 响应式" /></a>
  <a href="./docs/GUIDE.md"><img src="https://img.shields.io/badge/module-ESM%20%2B%20IIFE-475569?style=flat-square" alt="ESM 与 IIFE 双格式" /></a>
</div>

## 目录

- [快速开始](#快速开始)
- [特性一览](#特性一览)
- [使用文档](#使用文档)
- [许可证](#许可证)

---

## 快速开始

### 安装

| 方式       | 代码                                                                       | 适用场景   |
|------------|----------------------------------------------------------------------------|------------|
| **IIFE**   | `<script src="https://cxfjh.cn/js/ridom/0.1.0/0.1.0.js"></script>`                  | 无构建工具 |
| **Module** | `<script type="module" src="https://cxfjh.cn/js/ridom/0.1.0/es.0.1.0.js"></script>` | 模块化项目 |
| **Module** | `import ridom from "ridom";`                                     | 模块化项目 |

### Todo 应用

```html
<div r-data="{title: '我的待办事项', input: '',list: [{ text: '学习 Ridom', done: false }]}">
  <h2>{{ title }}</h2>
  <div>
    <input type="text" r-model="input" placeholder="输入待办..." />
    <button r-click="list.push({text: input, done: false})">添加</button>
  </div>
  <div r-for="list">
    <span r-click="list[index].done = !list[index].done">{{ value.done ? '✓' : '○' }} {{ value.text }}</span>
    <span r-click="list.splice(index, 1)">×</span>
  </div>
  <p>总数: {{ list.length }} | 已完成: {{ list.filter(v => v.done).length }}</p>
</div>
```

---

## 特性一览

| 特性         | 说明                                                         |
|--------------|--------------------------------------------------------------|
| **轻量级**   | gzip 仅 13KB，零外部依赖                                     |
| **高性能**   | 基于 Proxy 的深度响应式 + requestAnimationFrame 批量异步更新 |
| **组件化**   | 模板、样式、逻辑三者分离，支持 Scoped CSS                    |
| **指令系统** | 内置 8 个核心指令 + 可扩展的自定义指令                       |
| **路由管理** | 内置 SPA 路由，支持懒渲染、多容器、激活样式、按需卸载页面    |
| **零配置**   | 无需构建工具，`<script>` 标签引入即用                        |

---

## 使用文档

- [完全教程](https://github.com/cxfjh/ridom/blob/main/docs/USAGE.md) — 逐指令详解 + 踩坑对照
- [教程官网](https://cxfjh.cn/js/ridom/0.1.0/index.html) — 交互式在线文档页面

---

## 贡献指南

我们欢迎任何形式的贡献！推荐使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范

---

## 许可证

本项目基于 [MIT License](./LICENSE) 开源，允许个人和商业项目自由使用、修改和分发。

---

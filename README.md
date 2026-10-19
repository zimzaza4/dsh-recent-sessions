# dsh-recent-sessions

DeepSeek Harness Web 侧边栏的会话快捷区。

在自带的 **工作区** 区块下方加两块：**最近会话**（最近用过的会话，单行、定高、块内滚动，并标出所属工作区）和 **活跃会话**（只放要你处理的：等你回答 → 你未看的完成 → 正在工作）。顺带给 **工作区** 区块本身加了折叠开关。

## 安装

本插件是 profile bundle：

```sh
dsh plugin install link:<本仓库路径>
```

或手动：在 `<DSH_HOME>/profiles/<profile>/package.json` 的 `dependencies` 里加
`"@local/dsh-recent-sessions": "link:<本仓库路径>"`，并在 `dsh.profile.bundles` 里加上
`"@local/dsh-recent-sessions"`，然后在该 profile 目录执行 `pnpm install`。

装完重启 DSH。卸载走 **设置 → 插件** 里禁用该 bundle。

## 行为

- 置顶对话 / 最近会话 / 活跃会话三个列表都可折叠、可拖动排序，各自有独立设置页
- 行内行为与自带列表一致：悬停跑马灯、悬停卡片、双击重命名
- 归档会话、子代理会话、空白的新建会话不会出现
- 偏好存在 `localStorage` 的 `dsh-recent-sessions` 键下

## 开发

插件本身零依赖；测试借用相邻的 `node_modules` 里的 react / jsdom：

```sh
DRS_TEST_NODE_MODULES=<含 react 与 jsdom 的 node_modules> node test/anchor.test.mjs
```

`test/measure-gap.py` 是量截图中行间距的一次性小工具，需要 Pillow。

设计细节与全部实现取舍见 [DESIGN.md](DESIGN.md)。

## License

UNLICENSED（私有）。

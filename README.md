# dsh-recent-sessions

DeepSeek Harness Web 侧边栏的会话快捷区。

在自带的 **工作区** 区块下方加两块：**最近会话**（最近用过的会话，单行、定高、块内滚动，并标出所属工作区）和 **活跃会话**（只放要你处理的：等你回答 → 你未看的完成 → 正在工作）。顺带给 **工作区** 区块本身加了折叠开关。

## 安装

```sh
dsh plugin --profile <profile> add @zimzaza4/dsh-recent-sessions
```

装完重启 DSH。

卸载：

```sh
dsh plugin --profile <profile> remove @zimzaza4/dsh-recent-sessions
```

## 行为

- 置顶对话 / 最近会话 / 活跃会话三个列表都可折叠、可拖动排序，各自有独立设置页
- 行内行为与自带列表一致：悬停跑马灯、悬停卡片、双击重命名
- 归档会话、子代理会话、空白的新建会话不会出现
- 偏好存在 `localStorage` 的 `dsh-recent-sessions` 键下

## 开发

插件本身零依赖；测试借用相邻 `node_modules` 里的 react / jsdom：

```sh
DRS_TEST_NODE_MODULES=<含 react 与 jsdom 的 node_modules> node test/anchor.test.mjs
```

设计细节与全部实现取舍见 [DESIGN.md](DESIGN.md)。

## License

GPL-3.0-only，见 [LICENSE](LICENSE)。

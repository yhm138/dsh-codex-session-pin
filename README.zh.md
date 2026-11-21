# 会话置顶

在 DeepSeek Harness 的侧栏里置顶 / 取消置顶会话，并让置顶的会话排在所属项目最前面。

[English](README.md) | 简体中文

## 为什么做这个插件

DeepSeek Harness 官方本来就有会话置顶：`workspaceRegistry.pinSession()` / `unpinSession()` 把 `pinnedSessionIds` 持久化在 `~/.dsh/storages/workspace.json`，官方侧栏读取它。

但只要有第三方插件接管 `sidebar` 槽位，官方那套置顶界面就失效了。[`@michengai/dsh-codex-ui`](https://github.com/MichengAI/dsh-codex-ui) 正是如此：它自己画会话行、不读 `pinnedSessionIds`、也不渲染官方的 `sidebar.workspaces.session.menu.item` 行——数据层还在，入口却从界面上消失了。

这个插件把入口补回来，数据仍然只有官方那一份：

- 会话标题栏里的图钉（真实 slot：`conversation.session.header.utilities`，因此任何侧栏实现下都可用）
- 侧栏每条会话行悬停出现的图钉，以及行内 `⋯` 菜单的「置顶会话 / 取消置顶」
- 置顶行的图钉标记；置顶行排在所属项目的最前面

## 它不做什么

- **不存置顶状态**。置顶集合就是官方 `pinnedSessionIds`，本插件没有自己的索引文件，因此不会与宿主不一致，也不会和别的插件的索引打架。
- **不接管侧栏**，不改 React 状态里的行顺序，不改写其他插件的标记。排序靠给行写一个 `order`、把项目容器切成 `display: flex`；取消置顶时把这个内联属性撤掉，卸载插件即恢复侧栏原样。
- **不读写其他插件的数据**。

## 环境要求

- DeepSeek Harness Host `0.2.1-rc.2` 起、`0.2.x` 以内。
- 侧栏是官方实现（此时标题栏图钉仍可用），或者是 `@michengai/dsh-codex-ui`（此时行内按钮生效）。

## 安装

```sh
dsh plugin add dsh-codex-session-pin
```

装完重启 Harness；浏览器那半是 Client 模块，需要刷新页面才会加载。

## 用法

| 位置 | 说明 |
| --- | --- |
| 会话标题栏右侧 | 图钉按钮，点一次置顶，再点取消 |
| 侧栏会话行（悬停时） | 图钉按钮，与该行其他快捷操作并列 |
| 侧栏会话行 `⋯` 菜单 | 「置顶会话 / 取消置顶」 |

置顶的会话排在所属项目最前，标题前带图钉标记。多个置顶会话之间按官方 pin 顺序（最近置顶的在前）。

## 配置

只有一个选项，正常安装不需要动它：

```yaml
- id: codex-session-pin
  config:
    probe: true
```

`probe` 打开验证通道（见 [docs/verification.md](docs/verification.md)）：`~/.dsh/codex-session-pin/` 下的 JSONL 诊断与一次性命令通道，用于在没有页面自动化时驱动页面自身的动作路径。**默认关闭，关闭时不写任何文件**；关闭状态下客户端读到 `204 disabled` 就停止轮询。

## 路由

Host 半在 Harness web server 上注册：

| 路由 | 作用 |
| --- | --- |
| `POST /codex-session-pin/state` | 当前 `pinnedSessionIds` |
| `POST /codex-session-pin/toggle` | 兼容回落：给缺少 pin 方法的 Client 用 |
| `GET|POST /codex-session-pin/diag`、`/command` | 验证通道；未开 `probe` 时回 `204 disabled` |

正常路径不走 toggle 路由：浏览器半直接调 `ctx.workspaces.pinSession()` / `unpinSession()`，Host 路由只作兼容兜底。

## 兼容性

- 置顶状态与官方 UI 共用同一份数据，可以和别的会话类插件并存。不碰 `dsh-sessions-manager` 的 `star.json`（收藏是另一套语义、另一套 schema，与置顶无关）。
- 行增强只读侧栏插件自己发布的 `data-dcu-session`、`.dcu-wb-project-body`、`.dcu-wb-quick-actions`，只插入自己创建的节点。
- 注入节点按插件「代」登记：热重载不会误删新一代的节点，卸载只删自己那代的。
- 若侧栏实现变化导致这些挂钩消失，行内按钮不再出现，标题栏图钉照常可用，不会留下错误状态。

## 文件

```
index.js            Host 半：state / toggle 路由，可选的验证通道
client.js           浏览器半：标题栏图钉 + 侧栏行增强
cordis.patch.yml    bundle patch：一行插件注册
locale/{en,zh}.json 插件管理里的显示元数据
icon.svg            图标
docs/verification.md 浏览器半的端到端验证方法
```

## 许可

MIT

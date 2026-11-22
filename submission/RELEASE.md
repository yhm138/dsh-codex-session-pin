# 发布与收录记录 — dsh-codex-session-pin

> 2026-11-21 发布。供上下文压缩后复原"发到哪了、还差什么"。

## 结论先行

- **已发布**：npm `dsh-codex-session-pin@1.0.0`（latest），仓库 https://github.com/yhm138/dsh-codex-session-pin（public，带 `dsh-plugin` topic）。
- **收录未完成**：条目已按格式备好并通过本地校验，但 repo 创建于 `2026-11-21T05:46:36Z`，收录要求「仓库满 1 天」，门槛时间 = `2026-11-22T05:46:36Z`（北京时间 `2026-11-22 13:46`）。
- **定时任务已建**：`schedule-59a15226-5281-4c10-bf62-06a1008bcb4a`，每天 14:10（Asia/Shanghai）检查一次收录状态，过门槛后会自己开 PR。

## 为什么改了包名

原定包名 `dsh-session-pin` 已被 PerryLink 占用（v0.7.21，已在目录里，分类 session，功能更全）。同时它也用 `/session-pin/*` 路由——同名共存会冲突。因此：

- 包名 → `dsh-codex-session-pin`
- Host 路由前缀 → `/codex-session-pin/*`
- DOM 属性前缀 → `data-dcsp-*`
- locale 命名空间 → `codex-session-pin`
- Host 状态目录 → `~/.dsh/codex-session-pin/`

## 发布过程中修掉的 3 个真实缺陷

1. **`Config` 导出形式错误** → 用了普通对象 `{ probe: Boolean }`，Loader 报 `TypeError: Cannot read properties of undefined (reading 'validate')`，实例直接不激活。改为 schemastery：`import z from '@deepseek-ai/schemastery'` + `export const Config = z.object({...})`，并加 peerDependency。旧包没导出 Config，所以这个坑到现在才暴露。
2. **卸载后定时器仍读已删全局** → 600ms 的 `client-ready` 自报回调在插件卸载后才触发，读 `window.__dshCodexSessionPin` 抛 TypeError（离线 harness 抓到的）。改为记录 `disposed` 并在清理时 `clearTimeout`。
3. **探针通道默认开启** → 公开包不该往用户目录写诊断、也不该让页面每 1.5s 请求一次。改为 `probe` 默认关闭，服务端回 `204 disabled`，客户端见 204 立即停止轮询。

## npm 上那个 `0.0.0-stage` 是什么

是你自己账号（aspen138）早先留下的发布暂存占位（描述 "Temporary package placeholder for staged publishing"）。它让 `latest` 一开始指向 `0.0.0-stage`；`1.0.0` 发布落地后 `latest` 已自动指向 `1.0.0`。首次 publish 报 `E409 Cannot publish over previously staged version "1.0.0"` 属于正常现象——那是已经暂存成功，等待 registry 处理，重试反而才是错的。

## 收录提交规范（来自 contributing.md，已逐条核对）

- PR 只加**一个文件**：`data/plugins/<owner>__<repo>.yml`，**不要动 README**（合并后在 main 自动重新生成）。
- `package.json` 必须有 `dsh.bundle`（只有 `dsh.client` 不算可安装）→ 本包有。
- 仓库需满 1 天 → 未满。
- 仓库加 `dsh-plugin` topic → 已加。
- `icon` 必须是 **GitHub 托管位图**（.png/.jpg/.jpeg/.webp），SVG 会被拒 → 已生成 `assets/icon-180.png`（180×180）。
- 描述里不能有营销词，且每个声明要能在代码里核对。

## 本地预演结果

在 `awesome-dsh-plugin` 的临时 clone 里跑过：

- `node scripts/generate-readme.mjs --check` → icon 用 SVG 时失败，换 PNG 后仅剩「README 未同步」（这是只提交 yml 时的正常状态，CI 会重新生成）。
- `readEntries()` → 读到 1 条我们的条目，`url` / `category: session` / 中英描述齐全，无重复 url。
- 生成的 README.md 与 README.zh.md 第 5449 行都是我们那一条。

## 本机安装状态的坑（已处理）

把本机从「本地 link」切到「npm 正式版」时，`install_bundle` 报 `ERR_PNPM_EPERM ... rename ..._tmp_ -> dsh-codex-session-pin`。原因：上一版是 `link:` 装的，`node_modules/dsh-codex-session-pin` 是一个指向工作区源码目录的 **junction**，pnpm 无法用 rename 覆盖它。

处理方式（**顺序很重要**）：

1. `remove_bundle` —— 依赖项与 bundle 行都清掉。
2. 确认 junction 的目标就是那个源码目录，且目标文件数正常。
3. `cmd /c rmdir "…\node_modules\dsh-codex-session-pin"` —— **只删 junction 本身**。
   ⚠️ 绝对不要用 `Remove-Item -Recurse`：那会顺着链接把源码目录真删掉。
4. 再 `install_bundle dsh-codex-session-pin`（不带路径）—— 从 npm 拉 1.0.0。

结果：`node_modules/dsh-codex-session-pin` 是真实目录（`LinkType` 为空），profile 里记为 `^1.0.0`，源码目录 18 个文件完好。

## 1.0.2：重复图钉事故（用户报告）

**现象**：改了名之后重新进入，Session 左侧出现两个图钉，悬浮时右侧也出现两个。

**根因（已证实）**：不是新插件重复注入，而是**新旧两个 client 半同时活在同一个页面里**。`Slots.listSubTree` 给出决定性证据——`conversation.session.header.utilities` 里同时存在两个 occupant：

```
session-pin        order 5  active   ← 旧包（改名前的 dsh-session-pin）的 client 半
codex-session-pin  order 5  active   ← 新包的 client 半
```

两者的 DOM 前缀不同（旧 `data-dsp-*`，新 `data-dcsp-*`），所以各自注入一个标记和一个按钮，互不识别 → 各显示一份。

**为什么「重进」没有解决**：Host 进程自 11/20 20:44 起连续运行，从未重启。页面虽然重载，但 Host 侧的加载器/客户端模块图没有给出真正的重启语义；旧 client 模块仍在页面内存里。

**根因残留物**：`node_modules/dsh-session-pin` 是一个指向工作区旧目录的 **junction**，`remove_bundle` 清掉了依赖项与 bundle 行，但没有删掉这个链接。已用 `cmd /c rmdir` 删除（只删链接，源码目录 11 个文件完好）。

**1.0.2 的两处修改**：

1. `client.js` 的样式表隐藏旧前缀产物。旧的图钉按钮、标记、菜单项、标题栏按钮一律 `display:none!important`：
   ```css
   .dsp-mark,.dsp-pin-btn,[data-dsp-mark],[data-dsp-pin],[data-dsp-header],[data-dsp-menu]{display:none!important}
   ```
   这是幂等的：无论旧 client 半是否还活着、是否又重新注入，都看不见第二份。重载页面后旧半彻底消失，这条规则自然失效。

2. **`index.js` 不再 `import` schemastery**。这是安装 1.0.1 时暴露的真缺陷：Host 插件是**直接从包目录 import** 的，那个目录没有 `node_modules`，于是报
   `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery'`，实例直接不激活。改成从行配置里防御式读 `probe`，并在一个**没有 node_modules 的空目录**里验证过能正常加载（`isolated load OK, exports: apply,inject`）。

**验证**（1.0.2 装机后）：

- `node_modules/dsh-codex-session-pin` = `1.0.2`，profile 依赖记为 `1.0.2`，`application: applied`
- 旧包 `dsh-session-pin` 已不存在于 `node_modules`
- `/codex-session-pin/state` → 200，置顶 9 条原样保留
- `/codex-session-pin/diag` 与 `/command` → 204（probe 默认关闭）
- 旧路由 `/session-pin/state` → 404（旧 Host 半确实没跑）
- 离线 harness：`apply.ok:true, teardown:"ok"`
- npm `latest` = `1.0.2`

**仍待自然消解**：页面里那个旧的 `session-pin` occupant 要等 Host 真正重启才会从注册表消失。1.0.2 的隐藏规则让它在视觉上不可见，但注册表里仍会多一条。要彻底清干净，重启一次 DSH。

## 重启后复核（2026-11-21 22:54）

用户重启了 DSH。`Slots.listSubTree` 复核 `conversation.session.header.utilities` 的 occupants：

```
open-in-app, schedule-catalog, dsh-find-all, session-log-download,
codex-session-pin, conversation-navigator-toggle, dsh-btw-header, turn-navigator
```

`session-pin` **已消失**，只剩 `codex-session-pin` 一个。重复图钉的根因确认消除。

其余复核：

| 项 | 结果 |
| --- | --- |
| Host 进程 | 全部启于 `22:52:56`（真重启，不是重载页面） |
| GUI 端口 | `63954`（旧的是 `53122`，端口变化也证明进程重启） |
| 安装版本 | `1.0.2` |
| 旧路由 `/session-pin/state` | 404 |
| 新路由 `/codex-session-pin/state` | 200，9 条置顶原样 |
| 旧包 `node_modules/dsh-session-pin` | 不存在 |
| 旧诊断文件 `~/.dsh/session-pin/diag.jsonl` | 最后写入 `12:50`，之后 10 小时无写入 → 旧 client 半确实不再运行 |

隐藏规则的安全性也复核过：扫描 `node_modules` 下**除本包外**的所有 JS/MJS/CSS，没有任何插件使用 `dsp-mark` / `dsp-pin-btn` / `data-dsp-*`，所以那条 `display:none!important` 不会误伤别人（也查过 PerryLink 的 `dsh-session-pin@0.7.21`，它用的是 `data-board` / `data-color` / `data-session-id` 等，不冲突）。

## 收录 PR 已提交（2026-11-22）

仓库满 24 小时后（age 24.4h，脚本判定 `eligible to submit`）已提 PR：

- PR：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/17716
- 改动：`data/plugins/yhm138__dsh-codex-session-pin.yml`，**+7 / -0**，只有一个文件
- 分支：`yhm138:add/dsh-codex-session-pin` → `awesome-dsh-plugin:main`
- 基线上游 HEAD：`d9701b3`（重新 clone 的最新 main，不是旧 fork）

提交前的本地预演：

- `readEntries()` 读到 12520 条，我们 1 条，`category: session`，中英描述齐全，同 url 无重复
- `node scripts/generate-readme.mjs` 生成的中英两行都正确（链接与描述对得上）
- README 的改动已 `git checkout` 丢弃，只提交 yml（CI 合并后自动重新生成）
- 条目文件确认是无 BOM 的 UTF-8（终端显示乱码是 PowerShell 编码问题，不是文件问题）

CI 首轮进展：checkout / npm ci / stale-fork guard / 扩展名 / 路径 / README 对账 / awesome-lint / 四组测试 / published npm identity —— **前 15 步全部 success**，第 16 步 Build 在跑（1.2 万条目站点构建，慢属正常）。

## CI 结果（2026-11-22 14:42 北京时间）

PR #17716 的两项检查**全部通过**：

- check —— **pass**，耗时 30m20s（workflow run 44992663140）
- Submission gate —— **pass**

第 16 步 Build（1.2 万条目站点构建）跑完，整轮 CI 于 2026-11-22T06:42:31Z 以 success 结束。

PR 当前：OPEN、MERGEABLE、无 review 意见、无 label、无 assignee —— 即**在等维护者审阅**。

## 还要等多久（2026-11-22 18:29 核查）

- 仓库现有 **495 个 open PR**；我们这条按创建时间排第 60 新，即还有 59 条比我们新的排在前面。
- 上游最后一次提交是 2026-11-21T23:19:47Z（约 11 小时前），说明维护者这段时间没有合并动作。
- 结论：CI 已过，剩下纯人工审阅，不属于我们能推进的部分。目录维护者明确写过评审要「实际阅读目标仓库」，所以不会瞬间过。

**此阶段不要做的事**：不要重开 PR、不要修改已发布的 npm 版本、不要在 PR 里催促——都会被当作噪音。
## 待办（定时任务会推进）

- [x] 仓库满 1 天后提 PR：已完成，PR #17716
- [ ] 跟进 PR CI 与 reviewer 意见
- [ ] 收录后停掉定时任务
- [ ] 可在下个版本移除那条 `data-dsp-*` 隐藏规则（只为兼容改名前的旧页面，已无必要）

## 文件位置

- 条目源文件：`submission/yhm138__dsh-codex-session-pin.yml`
- 收录状态检查脚本：`submission/check-listing.mjs`（`node` 直接跑，exit 0 = 已收录）
- 发布物图标：`assets/icon-180.png`

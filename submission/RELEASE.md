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

## 待办（定时任务会推进）

- [ ] 等 `2026-11-22T05:46:36Z` 之后提 PR：`data/plugins/yhm138__dsh-codex-session-pin.yml`
- [ ] 跟进 PR CI 与 reviewer 意见
- [ ] 收录后停掉定时任务

## 文件位置

- 条目源文件：`submission/yhm138__dsh-codex-session-pin.yml`
- 收录状态检查脚本：`submission/check-listing.mjs`（`node` 直接跑，exit 0 = 已收录）
- 发布物图标：`assets/icon-180.png`

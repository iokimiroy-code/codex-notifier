# Codex 提示音

不用盯着 Codex，它会发出声音提醒你任务已经完成。

Codex 提示音是一个轻量级桌面伴侣：大窗口用于查看所有任务，小悬浮窗可以拖到屏幕任意边角。它通过 Codex Hooks 和 App Server 读取“当前电脑上的 Codex”任务事件，并在任务完成、等待确认或失败时发出声音和系统通知。

> 重要：这是一个独立的桌面伴侣，不会修改或嵌入 Codex 官方窗口。别人安装后，通知器显示的是他自己电脑上、自己账号里的 Codex 任务。

## 项目介绍

Codex 提示音把 Codex 的等待交给桌面助手：你可以继续写代码、查资料或处理其他事情，任务完成、需要确认或执行失败时，猫咪悬浮窗、声音和系统通知会主动叫你回来。

## 功能

- 中文 / English 切换
- 大窗口 / 可拖动小悬浮窗
- 任务列表、进度、等待确认、网络状态
- Codex Hook：开始、等待确认、完成、失败
- Codex App Server：Tauri 桌面版的原生事件通道
- Windows / macOS / Linux 原生通知（Tauri 构建版）
- 保留用户已有的 `~/.codex/hooks.json` 配置

## 开发运行

需要 Node.js 20+，并确保本机已经安装并登录 Codex CLI。

```bash
pnpm install
pnpm run hooks:install
pnpm run start
```

然后打开 `http://localhost:4173`。`pnpm run start` 会同时启动 Vite 前端和 `http://127.0.0.1:43123` 本地事件桥接。

安装 Hook 后，在 Codex CLI 中运行 `/hooks`，检查并信任 Codex 提示音的命令 Hook。Hook 是异步的；提示音没有启动时，不会阻断 Codex。

移除 Hook：

```bash
pnpm run hooks:uninstall
```

## Tauri 桌面版

要构建真正的桌面安装包，需要安装 Tauri 的 Rust / 系统依赖，然后执行：

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

Tauri 版会直接启动本机的 `codex app-server`，使用操作系统通知中心发送原生通知。若 Codex CLI 不在 PATH，可设置 `CODEX_BIN` 后再运行 Tauri。

## 从 GitHub 安装

拿到仓库地址后，其他用户可以这样安装：

```bash
git clone <仓库地址>
cd codex-notifier
pnpm install
pnpm run hooks:install
pnpm run start
```

如果要让用户直接双击安装，应发布 GitHub Release 并上传 `pnpm tauri build` 产生的安装包；仅仅把 GitHub 地址放进 Codex，并不会自动把一个网页界面注入 Codex 官方客户端。

## 真实 Codex 事件路线

```text
Codex Hooks / codex app-server
          ↓
本地 Hook 脚本或 Tauri Rust 桥接
          ↓
统一 TaskEvent
          ↓
React 状态面板 + 系统通知 + 声音
```

Codex 官方文档：

- [Hooks](https://learn.chatgpt.com/docs/hooks)
- [App Server](https://learn.chatgpt.com/docs/app-server)
- [Notifications](https://learn.chatgpt.com/docs/notifications)

## 当前边界

- App Server 连接的是通知器自己启动的 Codex App Server 会话；已经由其他 Codex 客户端启动的会话，使用 Hooks 事件接入。
- Codex Hook 是本地命令，需要用户在 `/hooks` 中检查和信任。
- 任务名称和精确进度取决于 Codex 当前版本提供的事件字段；没有百分比时，界面显示状态并保留已有进度。

## License

MIT

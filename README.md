# Codex 提示音

不用盯着 Codex，它会发出声音提醒你任务已经完成。

Codex 提示音是一个轻量级桌面伴侣：大窗口用于查看所有任务，小悬浮窗可以拖到屏幕任意边角。它通过 Codex 官方 `notify` 完成事件、Hooks 和 App Server 读取“当前电脑上的 Codex”任务事件，并在任务完成、等待确认或失败时发出声音、系统通知和窗口震动。

> 重要：这是一个独立的桌面伴侣，不会修改或嵌入 Codex 官方窗口。别人安装后，通知器显示的是他自己电脑上、自己账号里的 Codex 任务。

## 项目介绍

Codex 提示音把 Codex 的等待交给桌面助手：你可以继续写代码、查资料或处理其他事情，任务完成、需要确认或执行失败时，小狗悬浮窗、声音和系统通知会主动叫你回来。

## 功能

- 中文 / English 切换
- 启动默认显示小悬浮窗；点击小狗图标可展开大窗口，再点击收起按钮返回悬浮状态
- 实时任务列表：只显示本机 Codex 真实事件；完整列表可展开和滚动
- 真实完成率：显示“已完成 / 总任务”，不伪造无法从 Codex 取得的百分比
- 自动连接状态：根据浏览器在线状态和本地 Codex 桥接连接自动判定畅通、波动或异常
- 五个可选角色：小狗（默认）、小猫、机器人、小海豹、小海豚
- Windows 内置角色音：小狗完成时播放项目内置的狗叫 MP3；其他角色使用不同的内置音色
- 在设置中上传自己的 WAV、MP3 或 OGG 完成提示音（最大 2MB）；设置保存于本机，不会上传到云端
- 任务完成、等待确认或失败时支持窗口 / 悬浮窗震动提醒，可在设置中关闭
- Codex Hook：开始、等待确认、完成、失败
- Codex `notify`：可靠接收 `agent-turn-complete` 完成事件
- Codex App Server：Tauri 桌面版的原生事件通道
- 通用 Agent 接口：WorkBuddy、其他 Agent 或自动化脚本可通过 `/agent-event` 或 `pnpm run notify:agent` 发送统一状态
- Windows 开发版原生声音与通知；Tauri 构建版使用操作系统通知中心
- 保留用户已有的 `~/.codex/hooks.json` 配置

## 开发运行

需要 Node.js 20+，并确保本机已经安装并登录 Codex CLI。Tauri 桌面版还需要 Rust 工具链和 Windows WebView2。

浏览器开发版（用于快速预览）：

```bash
pnpm install
pnpm run setup
pnpm run start
```

然后打开 `http://localhost:5173`。`pnpm run start` 会同时启动 Vite 前端和 `http://127.0.0.1:43123` 本地事件桥接。

要让小悬浮窗独立浮在 GitHub、编辑器或其他软件上方，需要运行 Tauri 桌面版：

```bash
pnpm tauri dev
```

桌面版启动后默认是右下角的小图标窗口，并保持置顶；点击图标展开任务面板。发布给其他 Windows 用户时，应使用 Tauri 生成的安装包，而不是只打开 GitHub 网页。

`pnpm run setup` 会安装两条接入路径：`notify` 用于任务完成提醒，不需要 `/hooks` 信任流程；Hook 用于等待确认等生命周期事件，仍需在 Codex CLI 的 `/hooks` 中检查并信任。两者都是异步的，提示音没有启动时不会阻断 Codex。

### 接入其他 Agent

通知器默认自动监听 Codex；其他 Agent 使用本机通用事件接口即可复用声音、系统通知、窗口震动和任务列表：

```bash
pnpm run notify:agent -- --state completed --id task-123 --name "Build project" --source workbuddy
```

支持的状态是 `running`、`waiting`、`completed` 和 `failed`。也可以直接发送 HTTP：

```json
POST http://127.0.0.1:43123/agent-event
{
  "state": "completed",
  "taskId": "task-123",
  "name": "Build project",
  "source": "workbuddy"
}
```

Agent 只需要在状态变化时发送一次事件；通知器会负责任务列表、提示音、系统通知和震动。接口只监听本机回环地址，不会把任务内容上传到云端。

首次使用时，点击右侧 **设置**：

- 选择提示角色；选择会立即保存，下次启动仍然生效。
- 点击 **试播**，Windows 会播放当前角色或你上传的完成提示音。
- 点击 **上传音频** 后选择自己的 WAV、MP3 或 OGG。文件只写入 `%USERPROFILE%\\.codex\\codex-notifier\\sounds\\`，不会离开电脑。Windows 对 OGG 的播放取决于系统安装的媒体编解码器；WAV 是兼容性最高的格式。
- 可独立关闭声音提醒或系统通知；关闭声音时，任务状态仍会更新。
- **窗口震动**默认开启：它是桌面窗口的可见轻微抖动，不是手机或硬件马达震动；可在设置中关闭。

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
pnpm run setup
pnpm run start
```

如果要让用户直接双击安装，应发布 GitHub Release 并上传 `pnpm tauri build` 产生的安装包；仅仅把 GitHub 地址放进 Codex，并不会自动把一个网页界面注入 Codex 官方客户端。

## 真实 Codex 事件路线

```text
Codex notify / Hooks / codex app-server
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
- Codex `notify` 是任务完成的用户级外部通知入口；Hook 是本地命令，需要用户在 `/hooks` 中检查和信任。
- 任务名称和精确进度取决于 Codex 当前版本提供的事件字段；没有百分比时，界面显示状态并保留已有进度。
- “网络状态”表示通知器与本机 Codex 桥接的连通性，并结合浏览器在线状态；它不是一个可手动切换的演示控件。

## License

MIT

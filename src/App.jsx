import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellRinging, CaretRight, ChartBar, CheckCircle, CircleNotch, Clock, Dog, DotsThree,
  Fish, Gear, Globe, GridFour, Info, Minus, PawPrint, Play, Robot, SpeakerHigh,
  SpeakerSlash, SquaresFour, UploadSimple, WarningCircle, X, Cat,
} from "@phosphor-icons/react";
import {
  loadNotifierSettings, requestNativeAlert, saveNotifierSettings, subscribeToCodexEvents,
  uploadCustomSound,
} from "./services/notifierBridge.js";
import { subscribeToNetworkStatus } from "./services/network.js";

const PETS = [
  { id: "dog", zh: "小狗", en: "Dog", avatar: "/assets/dog-avatar.png", Icon: Dog },
  { id: "cat", zh: "小猫", en: "Cat", avatar: "/assets/cat-avatar.png", Icon: Cat },
  { id: "robot", zh: "机器人", en: "Robot", Icon: Robot },
  { id: "seal", zh: "小海豹", en: "Seal", Icon: PawPrint },
  { id: "dolphin", zh: "小海豚", en: "Dolphin", Icon: Fish },
];

const DEFAULT_SETTINGS = {
  lang: "zh", selectedPet: "dog", soundOn: true, nativeNotifications: true,
  vibrationOn: true, soundSource: "builtin", customSoundName: "",
};

const copy = {
  zh: {
    nav: { overview: "任务总览", progress: "完成进度", network: "网络状态", time: "任务时间", waiting: "等待确认", sound: "声音提醒", settings: "设置" },
    labels: {
      running: "进行中", waiting: "等待中", completed: "已完成", failed: "失败", total: "总任务",
      taskProgress: "完成进度", taskList: "任务列表", language: "语言", sound: "提示声音", nativeNotification: "系统通知",
      pet: "提示角色", customSound: "自定义完成提示音", upload: "上传音频", test: "试播", useBuiltIn: "使用内置声音", vibration: "窗口震动",
      viewAll: "查看全部任务", collapseList: "收起任务列表", drag: "拖拽可移动到\n屏幕任意边角", current: "当前任务",
      minimize: "收起窗口", expand: "展开窗口", mute: "关闭声音提醒", unmute: "打开声音提醒", close: "收起窗口",
      empty: "还没有收到 Codex 任务。开始一项任务后，它会自动出现在这里。", uploadHint: "支持 WAV、MP3、OGG，最大 2MB", builtinHint: "内置声音会随角色变化；小狗完成时为两声“汪”。",
      reset: "恢复默认声音", snap: "靠近边缘时自动吸附", elapsed: "已运行", connection: "Codex 连接", soundReady: "声音设置已保存", uploaded: "已使用你的提示音", playing: "正在通过 Windows 试播…",
    },
    notices: {
      muted: "声音提醒已关闭", unmuted: "声音提醒已打开", language: "语言已切换", moved: "悬浮窗位置已记住", connected: "已连接 Codex", hookReady: "已连接本地 Hook", connecting: "正在连接 Codex", disconnected: "本地桥接未运行", native: "原生桌面连接", completed: "任务已完成", waiting: "Codex 正在等待确认", failed: "任务执行失败", settingsFailed: "设置保存失败，请确认 pnpm run start 正在运行。", audioFailed: "无法试播，请确认本地桥接正在运行。",
    },
  },
  en: {
    nav: { overview: "Overview", progress: "Completion", network: "Network", time: "Task time", waiting: "Needs approval", sound: "Sound alerts", settings: "Settings" },
    labels: {
      running: "Running", waiting: "Waiting", completed: "Completed", failed: "Failed", total: "Total",
      taskProgress: "Completion", taskList: "Task list", language: "Language", sound: "Alert sound", nativeNotification: "System notifications",
      pet: "Notifier companion", customSound: "Custom completion sound", upload: "Upload audio", test: "Test", useBuiltIn: "Use built-in sound", vibration: "Window shake",
      viewAll: "View all tasks", collapseList: "Collapse task list", drag: "Drag to any\ncorner or edge", current: "Current task",
      minimize: "Collapse window", expand: "Expand window", mute: "Turn off sound alerts", unmute: "Turn on sound alerts", close: "Collapse window",
      empty: "No Codex task yet. Start one and it will appear here automatically.", uploadHint: "WAV, MP3, or OGG · up to 2MB", builtinHint: "Built-in sounds follow the selected companion; Dog gives two barks on completion.",
      reset: "Restore built-in sound", snap: "Snap near screen edges", elapsed: "Elapsed", connection: "Codex connection", soundReady: "Sound setting saved", uploaded: "Your sound is now active", playing: "Playing through Windows…",
    },
    notices: {
      muted: "Sound alerts are off", unmuted: "Sound alerts are on", language: "Language switched", moved: "Widget position remembered", connected: "Codex connected", hookReady: "Local Hook connected", connecting: "Connecting to Codex", disconnected: "Local bridge is not running", native: "Native desktop connection", completed: "Task completed", waiting: "Codex is waiting for approval", failed: "Task failed", settingsFailed: "Could not save settings. Check that pnpm run start is running.", audioFailed: "Could not play the alert. Check that the local bridge is running.",
    },
  },
};

const statusIcons = { running: CircleNotch, waiting: Clock, completed: CheckCircle, failed: WarningCircle };
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function getDefaultPosition(expanded) {
  if (typeof window === "undefined") return { x: 540, y: 88 };
  return expanded ? { x: Math.max(20, window.innerWidth - 960), y: 84 } : { x: Math.max(20, window.innerWidth - 112), y: Math.max(20, window.innerHeight - 134) };
}
function readStoredPosition() { try { return JSON.parse(localStorage.getItem("codex-notifier-position")) || getDefaultPosition(true); } catch { return getDefaultPosition(true); } }
function formatDuration(startedAt, fallback = "--:--:--") {
  if (!startedAt) return fallback;
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map((part) => String(part).padStart(2, "0")).join(":");
}
function sortTasks(tasks) {
  const order = { waiting: 0, running: 1, failed: 2, completed: 3 };
  return [...tasks].sort((a, b) => (order[a.state] - order[b.state]) || ((b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0)));
}
function upsertTask(current, task) {
  const index = current.findIndex((item) => item.id === task.id);
  const next = index < 0 ? [task, ...current] : current.map((item, itemIndex) => itemIndex === index ? { ...item, ...task } : item);
  return sortTasks(next).slice(0, 100);
}

function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [expanded, setExpanded] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [network, setNetwork] = useState({ status: "bad", latency: 0, online: navigator.onLine, healthy: false });
  const [position, setPosition] = useState(readStoredPosition);
  const [snapToEdge, setSnapToEdge] = useState(true);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [toast, setToast] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting");
  const [isAlerting, setIsAlerting] = useState(false);
  const [, setClock] = useState(Date.now());
  const dragRef = useRef(null);
  const toastTimer = useRef(null);
  const alertTimer = useRef(null);
  const previousTaskState = useRef(new Map());
  const uploadRef = useRef(null);
  const t = copy[settings.lang] || copy.zh;
  const activePet = PETS.find((pet) => pet.id === settings.selectedPet) || PETS[0];

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(alertTimer.current);
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => subscribeToNetworkStatus(setNetwork), []);
  useEffect(() => { loadNotifierSettings().then(({ settings: saved }) => setSettings((current) => ({ ...current, ...saved }))).catch(() => {}); }, []);

  useEffect(() => subscribeToCodexEvents({
    onStatus: (status) => {
      setConnectionState(status);
      if (["connected", "hook-ready", "native"].includes(status)) setNetwork((current) => ({ ...current, status: "good", healthy: true }));
      if (status === "disconnected") setNetwork((current) => ({ ...current, status: "bad", healthy: false }));
    },
    onEvent: (event) => {
      if (event.type === "BRIDGE_READY") {
        setTasks(sortTasks(Array.isArray(event.tasks) ? event.tasks : []));
        if (event.settings) setSettings((current) => ({ ...current, ...event.settings }));
        return;
      }
      if (event.type === "TASK_SNAPSHOT") { setTasks(sortTasks(Array.isArray(event.tasks) ? event.tasks : [])); return; }
      if (!event?.state || !["running", "waiting", "completed", "failed"].includes(event.state)) return;
      const taskId = event.id || event.taskId || event.threadId || event.sessionId || event.turnId || "codex-live";
      const task = { ...event, id: taskId, name: event.name || event.title || `Codex ${taskId.slice(0, 8)}`, time: event.time || "--:--:--" };
      setTasks((current) => upsertTask(current, task));
      const previous = previousTaskState.current.get(taskId);
      previousTaskState.current.set(taskId, task.state);
      if (previous === task.state) return;
      const message = task.state === "completed" ? t.notices.completed : task.state === "waiting" ? t.notices.waiting : task.state === "failed" ? t.notices.failed : "";
      if (message) showToast(message);
      if (message && settings.vibrationOn) {
        setIsAlerting(false);
        window.requestAnimationFrame(() => setIsAlerting(true));
        window.clearTimeout(alertTimer.current);
        alertTimer.current = window.setTimeout(() => setIsAlerting(false), 700);
      }
    },
  }), [settings.vibrationOn, showToast, t.notices.completed, t.notices.failed, t.notices.waiting]);

  useEffect(() => {
    if (!selectedTask && tasks[0]) setSelectedTask(tasks[0].id);
    if (selectedTask && !tasks.some((task) => task.id === selectedTask)) setSelectedTask(tasks[0]?.id || null);
  }, [selectedTask, tasks]);
  useEffect(() => {
    const onResize = () => setPosition((current) => ({ x: clamp(current.x, 14, Math.max(14, window.innerWidth - (expanded ? 960 : 100))), y: clamp(current.y, 14, Math.max(14, window.innerHeight - (expanded ? 700 : 100))) }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [expanded]);

  const moveWidget = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = expanded ? 940 : 92; const height = expanded ? 680 : 92;
    setPosition({ x: clamp(event.clientX - drag.offsetX, 14, Math.max(14, window.innerWidth - width - 14)), y: clamp(event.clientY - drag.offsetY, 14, Math.max(14, window.innerHeight - height - 14)) });
  }, [expanded]);
  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null; setIsDragging(false);
    setPosition((current) => {
      if (!snapToEdge) { localStorage.setItem("codex-notifier-position", JSON.stringify(current)); return current; }
      const width = expanded ? 940 : 92; const height = expanded ? 680 : 92;
      const snapped = { x: current.x < window.innerWidth / 2 ? 14 : Math.max(14, window.innerWidth - width - 14), y: current.y < window.innerHeight / 2 ? 14 : Math.max(14, window.innerHeight - height - 14) };
      localStorage.setItem("codex-notifier-position", JSON.stringify(snapped)); return snapped;
    });
    showToast(t.notices.moved);
  }, [expanded, showToast, snapToEdge, t.notices.moved]);
  useEffect(() => {
    if (!isDragging) return undefined;
    window.addEventListener("pointermove", moveWidget); window.addEventListener("pointerup", endDrag, { once: true });
    return () => { window.removeEventListener("pointermove", moveWidget); window.removeEventListener("pointerup", endDrag); };
  }, [endDrag, isDragging, moveWidget]);

  const beginDrag = (event) => {
    if (expanded && event.target.closest("button, input, label")) return;
    event.preventDefault(); dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y }; setIsDragging(true);
  };
  const persistSettings = async (partial, successMessage) => {
    setSettings((current) => ({ ...current, ...partial }));
    try {
      const { settings: saved } = await saveNotifierSettings(partial);
      setSettings((current) => ({ ...current, ...saved }));
      if (successMessage) showToast(successMessage);
    } catch { showToast(t.notices.settingsFailed); }
  };
  const handleUpload = async (event) => {
    const [file] = event.target.files || []; if (!file) return;
    try { const { settings: saved } = await uploadCustomSound(file); setSettings((current) => ({ ...current, ...saved })); showToast(t.labels.uploaded); }
    catch (error) { showToast(error.message || t.notices.settingsFailed); }
    event.target.value = "";
  };
  const testSound = async () => { showToast(t.labels.playing); try { await requestNativeAlert("complete"); } catch { showToast(t.notices.audioFailed); } };
  const handleExpand = () => { setExpanded(true); setPosition((current) => ({ x: clamp(current.x, 14, Math.max(14, window.innerWidth - 954)), y: clamp(current.y, 14, Math.max(14, window.innerHeight - 694)) })); };
  const handleCollapse = () => { setExpanded(false); setPosition((current) => ({ ...current, x: clamp(current.x, 14, Math.max(14, window.innerWidth - 106)), y: clamp(current.y, 14, Math.max(14, window.innerHeight - 106)) })); };

  const counts = useMemo(() => tasks.reduce((acc, task) => { acc[task.state] = (acc[task.state] || 0) + 1; return acc; }, { running: 0, waiting: 0, completed: 0, failed: 0 }), [tasks]);
  const completion = tasks.length ? Math.round((counts.completed / tasks.length) * 100) : 0;
  const activeTask = tasks.find((task) => task.id === selectedTask) || tasks.find((task) => task.state === "running") || tasks[0];
  const bridgeConnected = ["native", "connected", "hook-ready"].includes(connectionState);
  const networkStatus = bridgeConnected && network.status === "bad" ? "good" : network.status;
  const statusLabel = networkStatus === "good" ? (settings.lang === "zh" ? "畅通" : "Good") : networkStatus === "unstable" ? (settings.lang === "zh" ? "波动" : "Unstable") : (settings.lang === "zh" ? "异常" : "Offline");
  const connectionLabel = connectionState === "hook-ready" ? t.notices.hookReady : t.notices[connectionState] || t.notices.connecting;
  const connectionTone = connectionState === "native" || connectionState === "connected" || connectionState === "hook-ready" ? "is-live" : connectionState === "disconnected" ? "is-offline" : "is-pending";
  const widgetStyle = { left: `${position.x}px`, top: `${position.y}px` };

  return <main className={`app-shell ${expanded ? "is-expanded" : "is-collapsed"} ${isDragging ? "is-dragging" : ""} ${isAlerting ? "is-alerting" : ""}`}>
    <div className="desktop-layer" aria-hidden="true" />
    {!expanded ? <button className="floating-widget" style={widgetStyle} onPointerDown={beginDrag} onClick={handleExpand} aria-label={t.labels.expand} title={t.labels.expand}><span className="floating-ring" /><PetAvatar pet={activePet} /><span className={`floating-status ${networkStatus}`} /><span className="floating-badge">{counts.waiting || ""}</span><span className="floating-drag-hint"><DotsThree size={17} weight="bold" /></span></button> : <section className="notifier-window" style={widgetStyle} aria-label={settings.lang === "zh" ? "Codex 提示音" : "Codex Alert"}>
      <header className="window-header" onPointerDown={beginDrag}><div className="brand-lockup"><span className="brand-avatar"><PetAvatar pet={activePet} /></span><span><strong>{settings.lang === "zh" ? "Codex 提示音" : "Codex Alert"}</strong><small>{settings.lang === "zh" ? "不用盯着，完成会提醒" : "Hear when Codex is done"}</small></span></div><div className="window-actions"><button className="icon-button" onClick={handleCollapse} aria-label={t.labels.minimize} title={t.labels.minimize}><Minus size={20} weight="bold" /></button><button className="icon-button" onClick={handleCollapse} aria-label={t.labels.close} title={t.labels.close}><X size={20} weight="bold" /></button></div></header>
      <div className="window-body"><aside className="sidebar"><nav aria-label={settings.lang === "zh" ? "主导航" : "Main navigation"}><NavItem icon={GridFour} label={t.nav.overview} active /><NavItem icon={ChartBar} label={t.nav.progress} /><NavItem icon={Globe} label={t.nav.network} badge={statusLabel} tone={networkStatus} /><NavItem icon={Clock} label={t.nav.time} /><NavItem icon={BellRinging} label={t.nav.waiting} badge={counts.waiting} tone="coral" onClick={() => setSelectedTask(tasks.find((task) => task.state === "waiting")?.id || null)} /><NavItem icon={settings.soundOn ? SpeakerHigh : SpeakerSlash} label={t.nav.sound} onClick={() => persistSettings({ soundOn: !settings.soundOn }, !settings.soundOn ? t.notices.unmuted : t.notices.muted)} /><NavItem icon={Gear} label={t.nav.settings} active={settingsOpen} onClick={() => setSettingsOpen((current) => !current)} /></nav><div className="sidebar-footer"><span className="help-button"><Info size={18} /><span>v1.1</span></span></div></aside>
        <section className="overview-panel"><div className="panel-heading"><div><p className="eyebrow">{t.nav.overview}</p><h1>{settings.lang === "zh" ? "一眼看清所有 Agent" : "See every Agent at a glance"}</h1><div className={`connection-pill ${connectionTone}`}><span className="connection-dot" />{connectionLabel}</div></div></div><div className="summary-grid"><div className="progress-orb" style={{ "--completion": `${completion}%` }} aria-label={`${t.labels.taskProgress} ${counts.completed}/${tasks.length}`}><span className="orb-track" /><span className="orb-value">{counts.completed}/{tasks.length}</span><span className="orb-caption">{t.labels.taskProgress}</span></div><div className="summary-counts"><SummaryCount icon={Play} value={counts.running} label={t.labels.running} tone="mint" /><SummaryCount icon={Clock} value={counts.waiting} label={t.labels.waiting} tone="coral" /><SummaryCount icon={CheckCircle} value={counts.completed} label={t.labels.completed} tone="blue" /><SummaryCount icon={SquaresFour} value={tasks.length} label={t.labels.total} tone="lavender" /></div></div><div className="task-section"><div className="section-heading"><h2>{t.labels.taskList}</h2><button onClick={() => setShowAllTasks((current) => !current)}>{showAllTasks ? t.labels.collapseList : t.labels.viewAll}<CaretRight className={showAllTasks ? "is-open" : ""} size={16} weight="bold" /></button></div><div className={`task-list ${showAllTasks ? "is-expanded" : ""}`}>{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} selected={selectedTask === task.id} labels={t.labels} onClick={() => setSelectedTask(task.id)} />) : <div className="empty-tasks">{t.labels.empty}</div>}</div></div><div className="network-strip"><span className={`network-dot ${networkStatus}`} /><span>{t.nav.network}</span><strong className={networkStatus}>{statusLabel}</strong><small>{network.healthy ? `${network.latency}ms` : ""}</small><span className="network-divider" /><Clock size={17} weight="bold" /><span>{activeTask ? t.labels.elapsed : t.nav.time}</span><strong className="task-elapsed">{activeTask ? formatDuration(activeTask.startedAt, activeTask.time) : "--:--:--"}</strong></div></section>
        {settingsOpen && <aside className="settings-panel"><div className="settings-heading"><h2>{t.nav.settings}</h2><Gear size={21} weight="duotone" /></div><div className="setting-block"><span className="setting-label">{t.labels.language}</span><div className="language-toggle" role="group" aria-label={t.labels.language}><button className={settings.lang === "zh" ? "is-active" : ""} onClick={() => persistSettings({ lang: "zh" }, copy.zh.notices.language)}>中文</button><button className={settings.lang === "en" ? "is-active" : ""} onClick={() => persistSettings({ lang: "en" }, copy.en.notices.language)}>English</button></div></div><ToggleRow label={t.labels.snap} checked={snapToEdge} onChange={() => setSnapToEdge((current) => !current)} /><ToggleRow label={t.labels.nativeNotification} checked={settings.nativeNotifications} onChange={() => persistSettings({ nativeNotifications: !settings.nativeNotifications })} /><ToggleRow label={t.labels.vibration} checked={settings.vibrationOn} onChange={() => persistSettings({ vibrationOn: !settings.vibrationOn })} /><div className="setting-block"><span className="setting-label">{t.labels.pet}</span><div className="pet-grid">{PETS.map((pet) => <button key={pet.id} className={`pet-choice ${pet.id === activePet.id ? "is-selected" : ""}`} onClick={() => persistSettings({ selectedPet: pet.id }, t.labels.soundReady)}><PetAvatar pet={pet} /><span>{settings.lang === "zh" ? pet.zh : pet.en}</span></button>)}</div></div><div className="setting-block sound-settings"><span className="setting-label">{t.labels.customSound}</span><p>{settings.soundSource === "custom" && settings.customSoundName ? settings.customSoundName : t.labels.builtinHint}</p><input ref={uploadRef} type="file" accept="audio/wav,audio/mpeg,audio/ogg,.wav,.mp3,.ogg" onChange={handleUpload} hidden /><div className="sound-actions"><button className="upload-button" onClick={() => uploadRef.current?.click()}><UploadSimple size={15} weight="bold" />{t.labels.upload}</button><button className="test-button" onClick={testSound}><SpeakerHigh size={15} weight="bold" />{t.labels.test}</button></div>{settings.soundSource === "custom" && <button className="link-button" onClick={() => persistSettings({ soundSource: "builtin" }, t.labels.soundReady)}>{t.labels.useBuiltIn}</button>}<small>{t.labels.uploadHint}</small></div></aside>}
      </div></section>}
    {expanded && <div className="move-callout"><span className="move-icon">↕</span><span>{t.labels.drag.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</span></div>}{toast && <div className="toast" role="status"><CheckCircle size={18} weight="fill" />{toast}</div>}
  </main>;
}

function PetAvatar({ pet }) { const Icon = pet.Icon; return pet.avatar ? <img src={pet.avatar} alt="" /> : <Icon className="pet-icon" size={28} weight="duotone" aria-hidden="true" />; }
function TaskRow({ task, selected, labels, onClick }) { const StatusIcon = statusIcons[task.state] || CircleNotch; return <button className={`task-row ${selected ? "is-selected" : ""}`} onClick={onClick}><span className={`task-status-icon ${task.state}`}><StatusIcon size={17} weight="bold" /></span><span className="task-name">{task.name || task.id}</span><span className={`task-state ${task.state}`}>{labels[task.state] || task.state}</span><span className="task-time">{formatDuration(task.startedAt, task.time)}</span><CaretRight className="task-arrow" size={18} weight="bold" /></button>; }
function NavItem({ icon: Icon, label, active, badge, tone, onClick }) { return <button className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick}><Icon size={21} weight={active ? "fill" : "regular"} /><span>{label}</span>{badge !== undefined && <small className={`nav-badge ${tone || ""}`}>{badge}</small>}</button>; }
function SummaryCount({ icon: Icon, value, label, tone }) { return <div className="summary-count"><span className={`count-icon ${tone}`}><Icon size={17} weight="bold" /></span><span><strong>{value}</strong><small>{label}</small></span></div>; }
function ToggleRow({ label, checked, onChange }) { return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={onChange} /><span className="toggle-track"><span /></span></label>; }

export { App };
export default App;

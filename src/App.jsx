import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRinging,
  CaretRight,
  ChartBar,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  DotsThree,
  Gear,
  Globe,
  GridFour,
  Info,
  Minus,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  SquaresFour,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { subscribeToCodexEvents } from "./services/notifierBridge.js";
import { notifyUser, playAlert } from "./services/notifications.js";

const CAT_AVATAR = "/assets/cat-avatar.png";

const copy = {
  zh: {
    nav: { overview: "任务总览", progress: "任务进度", network: "网络状态", time: "任务时间", waiting: "等待确认", sound: "声音提醒", settings: "设置" },
    labels: {
      running: "进行中", waiting: "等待中", completed: "已完成", failed: "失败", total: "总任务", taskProgress: "任务进度", taskList: "任务列表", language: "语言", startup: "开机启动", snap: "最小化到边角", opacity: "透明度", theme: "主题色", reset: "恢复默认设置", viewAll: "查看全部任务", drag: "拖拽可移动到\n屏幕任意边角", current: "当前任务", minimize: "收起窗口", expand: "展开窗口", mute: "关闭声音提醒", unmute: "打开声音提醒", close: "关闭", simulation: "模拟状态变化",
    },
    tasks: { profile: "生成用户画像数据分析", model: "优化推荐算法模型", report: "导出报表并发送邮件", docs: "确认产品需求文档", sync: "同步数据到数据仓库" },
    notices: { muted: "声音提醒已关闭", unmuted: "声音提醒已打开", language: "语言已切换", moved: "悬浮窗位置已记住", simulated: "任务状态已刷新", connected: "已连接 Codex", hookReady: "已等待 Codex Hook", connecting: "正在连接 Codex", disconnected: "等待本地桥接", native: "原生桌面连接", completed: "任务已完成", waiting: "Codex 正在等待确认", failed: "任务执行失败" },
  },
  en: {
    nav: { overview: "Overview", progress: "Progress", network: "Network", time: "Task time", waiting: "Needs approval", sound: "Sound alerts", settings: "Settings" },
    labels: {
      running: "Running", waiting: "Waiting", completed: "Completed", failed: "Failed", total: "Total", taskProgress: "Task progress", taskList: "Task list", language: "Language", startup: "Launch at startup", snap: "Snap to corner", opacity: "Opacity", theme: "Theme color", reset: "Restore defaults", viewAll: "View all tasks", drag: "Drag to any\ncorner or edge", current: "Current task", minimize: "Collapse window", expand: "Expand window", mute: "Turn off sound alerts", unmute: "Turn on sound alerts", close: "Close", simulation: "Simulate status change",
    },
    tasks: { profile: "Generate user profile analysis", model: "Optimize recommendation model", report: "Export report and email it", docs: "Confirm product requirements", sync: "Sync data to warehouse" },
    notices: { muted: "Sound alerts are off", unmuted: "Sound alerts are on", language: "Language switched", moved: "Widget position remembered", simulated: "Task status refreshed", connected: "Codex connected", hookReady: "Waiting for Codex hooks", connecting: "Connecting to Codex", disconnected: "Waiting for local bridge", native: "Native desktop connection", completed: "Task completed", waiting: "Codex is waiting for approval", failed: "Task failed" },
  },
};

const taskSeed = [
  { id: "profile", key: "profile", state: "running", progress: 72, time: "00:18:36" },
  { id: "model", key: "model", state: "waiting", progress: 64, time: "00:12:08" },
  { id: "report", key: "report", state: "running", progress: 42, time: "00:09:14" },
  { id: "docs", key: "docs", state: "waiting", progress: 86, time: "00:06:42" },
  { id: "sync", key: "sync", state: "completed", progress: 100, time: "00:03:21" },
];

const statusIcons = { running: CircleNotch, waiting: Clock, completed: CheckCircle, failed: WarningCircle };

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function getDefaultPosition(expanded) {
  if (typeof window === "undefined") return { x: 540, y: 88 };
  return expanded ? { x: Math.max(20, window.innerWidth - 960), y: 84 } : { x: Math.max(20, window.innerWidth - 112), y: Math.max(20, window.innerHeight - 134) };
}

function App() {
  const [lang, setLang] = useState("zh");
  const [expanded, setExpanded] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selectedTask, setSelectedTask] = useState("profile");
  const [tasks, setTasks] = useState(taskSeed);
  const [network, setNetwork] = useState("good");
  const [position, setPosition] = useState(() => getDefaultPosition(true));
  const [toast, setToast] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting");
  const dragRef = useRef(null);
  const toastTimer = useRef(null);
  const previousTaskState = useRef(new Map());
  const t = copy[lang];

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => subscribeToCodexEvents({
    onStatus: setConnectionState,
    onEvent: (event) => {
      if (event.type === "TASK_SNAPSHOT") {
        if (Array.isArray(event.tasks) && event.tasks.length) setTasks(event.tasks);
        return;
      }
      if (event.type === "NETWORK_WARNING") {
        setNetwork("unstable");
        return;
      }
      if (!["TASK_STARTED", "TASK_RUNNING", "TASK_WAITING", "TASK_COMPLETED", "TASK_FAILED"].includes(event.type)) return;

      const stateByEvent = { TASK_STARTED: "running", TASK_RUNNING: "running", TASK_WAITING: "waiting", TASK_COMPLETED: "completed", TASK_FAILED: "failed" };
      const state = stateByEvent[event.type];
      const taskId = event.taskId || event.threadId || event.sessionId || event.turnId || "codex-live";
      const taskName = event.name || event.title || `Codex ${taskId.slice(0, 8)}`;
      const nextTask = { id: taskId, key: null, name: taskName, state, progress: event.progress ?? (state === "completed" ? 100 : undefined), time: event.time || "--:--:--", live: true };
      setTasks((current) => {
        const index = current.findIndex((task) => task.id === taskId);
        if (index < 0) return [nextTask, ...current].slice(0, 8);
        return current.map((task, taskIndex) => taskIndex === index ? { ...task, ...nextTask, progress: nextTask.progress ?? task.progress } : task);
      });

      const previous = previousTaskState.current.get(taskId);
      previousTaskState.current.set(taskId, state);
      if (previous === state) return;
      const message = state === "completed" ? t.notices.completed : state === "waiting" ? t.notices.waiting : state === "failed" ? t.notices.failed : "";
      if (message) {
        if (!window.__TAURI__) notifyUser({ title: "Codex 提示音", body: `${taskName} · ${message}` });
        if (soundOn) playAlert(state === "failed" ? "failed" : state === "waiting" ? "waiting" : "complete");
        showToast(message);
      }
    },
  }), [showToast, soundOn, t.notices.completed, t.notices.failed, t.notices.waiting]);

  useEffect(() => {
    const onResize = () => setPosition((current) => ({ x: clamp(current.x, 14, Math.max(14, window.innerWidth - (expanded ? 960 : 100))), y: clamp(current.y, 14, Math.max(14, window.innerHeight - (expanded ? 700 : 100))) }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [expanded]);

  const moveWidget = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = expanded ? 940 : 92;
    const height = expanded ? 680 : 92;
    setPosition({ x: clamp(event.clientX - drag.offsetX, 14, Math.max(14, window.innerWidth - width - 14)), y: clamp(event.clientY - drag.offsetY, 14, Math.max(14, window.innerHeight - height - 14)) });
  }, [expanded]);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    showToast(t.notices.moved);
  }, [showToast, t.notices.moved]);

  useEffect(() => {
    if (!isDragging) return undefined;
    window.addEventListener("pointermove", moveWidget);
    window.addEventListener("pointerup", endDrag, { once: true });
    return () => { window.removeEventListener("pointermove", moveWidget); window.removeEventListener("pointerup", endDrag); };
  }, [endDrag, isDragging, moveWidget]);

  const beginDrag = (event) => {
    if (expanded && event.target.closest("button")) return;
    event.preventDefault();
    dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
    setIsDragging(true);
  };

  const toggleSound = () => { const next = !soundOn; setSoundOn(next); showToast(next ? t.notices.unmuted : t.notices.muted); };
  const toggleLanguage = (nextLanguage) => { if (nextLanguage === lang) return; setLang(nextLanguage); showToast(copy[nextLanguage].notices.language); };
  const simulateTaskUpdate = () => {
    setTasks((current) => current.map((task, index) => index !== 0 ? task : { ...task, progress: task.progress >= 96 ? 42 : task.progress + 8, state: task.progress >= 96 ? "completed" : "running" }));
    showToast(t.notices.simulated);
  };
  const handleExpand = () => { setExpanded(true); setPosition((current) => ({ x: clamp(current.x, 14, Math.max(14, window.innerWidth - 954)), y: clamp(current.y, 14, Math.max(14, window.innerHeight - 694)) })); };
  const handleCollapse = () => { setExpanded(false); setPosition(getDefaultPosition(false)); };

  const activeTask = tasks.find((task) => task.id === selectedTask) || tasks[0];
  const counts = tasks.reduce((acc, task) => { acc[task.state] += 1; return acc; }, { running: 0, waiting: 0, completed: 0, failed: 0 });
  const statusLabel = network === "good" ? (lang === "zh" ? "畅通" : "Good") : network === "unstable" ? (lang === "zh" ? "波动" : "Unstable") : (lang === "zh" ? "异常" : "Offline");
  const connectionLabel = connectionState === "hook-ready" ? t.notices.hookReady : t.notices[connectionState] || (lang === "zh" ? "演示模式" : "Demo mode");
  const connectionTone = connectionState === "native" || connectionState === "connected" || connectionState === "hook-ready" ? "is-live" : connectionState === "disconnected" ? "is-offline" : "is-pending";
  const widgetStyle = { left: `${position.x}px`, top: `${position.y}px` };

  return (
    <main className={`app-shell ${expanded ? "is-expanded" : "is-collapsed"} ${isDragging ? "is-dragging" : ""}`}>
      <div className="desktop-layer" aria-hidden="true" />
      {!expanded ? (
        <button className="floating-widget" style={widgetStyle} onPointerDown={beginDrag} onClick={handleExpand} aria-label={t.labels.expand} title={t.labels.expand}>
          <span className="floating-ring" /><img src={CAT_AVATAR} alt="" /><span className="floating-status" /><span className="floating-badge">{counts.waiting}</span><span className="floating-drag-hint"><DotsThree size={17} weight="bold" /></span>
        </button>
      ) : (
        <section className="notifier-window" style={widgetStyle} aria-label={lang === "zh" ? "Codex 提示音" : "Codex Alert"}>
          <header className="window-header" onPointerDown={beginDrag}>
            <div className="brand-lockup"><span className="brand-avatar"><img src={CAT_AVATAR} alt="" /></span><span><strong>{lang === "zh" ? "Codex 提示音" : "Codex Alert"}</strong><small>{lang === "zh" ? "不用盯着，完成会提醒" : "Hear when Codex is done"}</small></span></div>
            <div className="window-actions"><button className="icon-button" onClick={handleCollapse} aria-label={t.labels.minimize} title={t.labels.minimize}><Minus size={20} weight="bold" /></button><button className="icon-button" onClick={() => showToast(t.labels.close)} aria-label={t.labels.close} title={t.labels.close}><X size={20} weight="bold" /></button></div>
          </header>
          <div className="window-body">
            <aside className="sidebar">
              <nav aria-label={lang === "zh" ? "主导航" : "Main navigation"}>
                <NavItem icon={GridFour} label={t.nav.overview} active />
                <NavItem icon={ChartBar} label={t.nav.progress} onClick={simulateTaskUpdate} />
                <NavItem icon={Globe} label={t.nav.network} badge={statusLabel} onClick={() => setNetwork((current) => current === "good" ? "unstable" : current === "unstable" ? "bad" : "good")} />
                <NavItem icon={Clock} label={t.nav.time} />
                <NavItem icon={BellRinging} label={t.nav.waiting} badge={counts.waiting} tone="coral" onClick={() => setSelectedTask("model")} />
                <NavItem icon={soundOn ? SpeakerHigh : SpeakerSlash} label={t.nav.sound} onClick={toggleSound} />
                <NavItem icon={Gear} label={t.nav.settings} active={settingsOpen} onClick={() => setSettingsOpen((current) => !current)} />
              </nav>
              <div className="sidebar-footer"><button className="help-button" onClick={() => showToast(lang === "zh" ? "通知器正在正常工作" : "Notifier is working normally")}><Info size={18} /><span>v1.0 MVP</span></button></div>
            </aside>
            <section className="overview-panel">
              <div className="panel-heading"><div><p className="eyebrow">{t.nav.overview}</p><h1>{lang === "zh" ? "一眼看清所有 Agent" : "See every Agent at a glance"}</h1><div className={`connection-pill ${connectionTone}`}><span className="connection-dot" />{connectionLabel}</div></div><button className="more-button" onClick={simulateTaskUpdate} title={t.labels.simulation} aria-label={t.labels.simulation}><DotsThree size={24} weight="bold" /></button></div>
              <div className="summary-grid">
                <button className="progress-orb" onClick={simulateTaskUpdate} title={t.labels.simulation}><span className="orb-track" /><span className="orb-value">{activeTask.progress}%</span><span className="orb-caption">{t.labels.taskProgress}</span></button>
                <div className="summary-counts"><SummaryCount icon={Play} value={counts.running} label={t.labels.running} tone="mint" /><SummaryCount icon={Clock} value={counts.waiting} label={t.labels.waiting} tone="coral" /><SummaryCount icon={CheckCircle} value={counts.completed} label={t.labels.completed} tone="blue" /><SummaryCount icon={SquaresFour} value={tasks.length} label={t.labels.total} tone="lavender" /></div>
              </div>
              <div className="task-section"><div className="section-heading"><h2>{t.labels.taskList}</h2><button onClick={simulateTaskUpdate}>{t.labels.viewAll}<CaretRight size={16} weight="bold" /></button></div><div className="task-list">{tasks.map((task) => { const StatusIcon = statusIcons[task.state]; return <button key={task.id} className={`task-row ${selectedTask === task.id ? "is-selected" : ""}`} onClick={() => setSelectedTask(task.id)}><span className={`task-status-icon ${task.state}`}><StatusIcon size={17} weight="bold" /></span><span className="task-name">{task.key && t.tasks[task.key] ? t.tasks[task.key] : task.name || task.id}</span><span className={`task-state ${task.state}`}>{t.labels[task.state]}</span><span className="task-time">{task.time}</span><CaretRight className="task-arrow" size={18} weight="bold" /></button>; })}</div></div>
              <div className="network-strip"><span className={`network-dot ${network}`} /><span>{t.nav.network}</span><strong>{statusLabel}</strong><span className="network-divider" /><Clock size={17} weight="bold" /><span>{t.nav.time}</span><strong>00:18:36</strong></div>
            </section>
            {settingsOpen && <aside className="settings-panel"><div className="settings-heading"><h2>{t.nav.settings}</h2><Gear size={21} weight="duotone" /></div><div className="setting-block"><span className="setting-label">{t.labels.language}</span><div className="language-toggle" role="group" aria-label={t.labels.language}><button className={lang === "zh" ? "is-active" : ""} onClick={() => toggleLanguage("zh")}>中文</button><button className={lang === "en" ? "is-active" : ""} onClick={() => toggleLanguage("en")}>English</button></div></div><ToggleRow label={t.labels.startup} checked onChange={() => showToast(lang === "zh" ? "开机启动已切换" : "Startup setting changed")} /><ToggleRow label={t.labels.snap} checked onChange={() => showToast(lang === "zh" ? "自动吸附已切换" : "Snap setting changed")} /><div className="setting-block"><div className="setting-inline"><span className="setting-label">{t.labels.opacity}</span><strong>80%</strong></div><input className="range-input" type="range" min="50" max="100" defaultValue="80" aria-label={t.labels.opacity} /></div><div className="setting-block"><span className="setting-label">{t.labels.theme}</span><div className="theme-swatches"><button className="swatch coral is-selected" aria-label="Coral theme"><Check size={14} weight="bold" /></button><button className="swatch mint" aria-label="Mint theme" /><button className="swatch blue" aria-label="Blue theme" /><button className="swatch lavender" aria-label="Lavender theme" /></div></div><button className="reset-button" onClick={() => showToast(lang === "zh" ? "已恢复默认设置" : "Defaults restored")}>{t.labels.reset}</button></aside>}
          </div>
        </section>
      )}
      {expanded && <div className="move-callout"><span className="move-icon">↕</span><span>{t.labels.drag.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</span></div>}
      {toast && <div className="toast" role="status"><CheckCircle size={18} weight="fill" />{toast}</div>}
    </main>
  );
}

function NavItem({ icon: Icon, label, active, badge, tone, onClick }) {
  return <button className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick}><Icon size={21} weight={active ? "fill" : "regular"} /><span>{label}</span>{badge !== undefined && <small className={`nav-badge ${tone || ""}`}>{badge}</small>}</button>;
}

function SummaryCount({ icon: Icon, value, label, tone }) {
  return <div className="summary-count"><span className={`count-icon ${tone}`}><Icon size={17} weight="bold" /></span><span><strong>{value}</strong><small>{label}</small></span></div>;
}

function ToggleRow({ label, checked, onChange }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={onChange} /><span className="toggle-track"><span /></span></label>;
}

export { App };
export default App;

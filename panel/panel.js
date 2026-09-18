const providers = [
  { id: "chatgpt", name: "ChatGPT", note: "OpenAI · 全球", url: "https://chatgpt.com/" },
  { id: "gemini", name: "Gemini", note: "Google · 海外网络", url: "https://gemini.google.com/app" },
  { id: "deepseek", name: "DeepSeek", note: "中国大陆友好", url: "https://chat.deepseek.com/" },
  { id: "qwen", name: "通义千问", note: "中国大陆友好", url: "https://chat.qwen.ai/" }
];

const preview = document.querySelector("#context-preview");
const status = document.querySelector("#context-status");
const question = document.querySelector("#question");
const tileWindow = document.querySelector("#tile-window");
const providerGrid = document.querySelector("#provider-grid");
const versionLabel = document.querySelector("#version-label");
const toast = document.querySelector("#toast");
let activeContext = null;
let toastTimer = null;

init();

async function init() {
  const version = chrome.runtime.getManifest().version;
  versionLabel.textContent = `v${version}`;
  renderEnvironmentNotice();
  renderProviders();

  const saved = await chrome.storage.local.get(["contextMode", "tileWindow"]);
  if (saved.contextMode) {
    const radio = document.querySelector(`input[name="mode"][value="${saved.contextMode}"]`);
    if (radio) radio.checked = true;
  }
  if (typeof saved.tileWindow === "boolean") tileWindow.checked = saved.tileWindow;
  await refreshContext();
}

document.querySelector("#refresh-context").addEventListener("click", refreshContext);
document.querySelector("#check-update").addEventListener("click", checkForUpdates);
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", async () => {
    await chrome.storage.local.set({ contextMode: radio.value });
    await refreshContext();
  });
});
tileWindow.addEventListener("change", () => chrome.storage.local.set({ tileWindow: tileWindow.checked }));

function renderProviders() {
  providerGrid.replaceChildren(...providers.map((provider) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-button";
    button.innerHTML = `<strong>${provider.name}</strong><small>${provider.note}</small>`;
    button.addEventListener("click", () => launchProvider(provider));
    return button;
  }));
}

function renderEnvironmentNotice() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "未知时区";
  const language = navigator.language || "未知语言";
  const likelyMainland = timezone === "Asia/Shanghai" && /^zh(-CN)?/i.test(language);
  document.querySelector("#environment-notice").textContent = likelyMainland
    ? `环境提示：当前浏览器更接近中国大陆环境（${timezone}）。可优先尝试 DeepSeek 或通义千问；ChatGPT、Gemini 是否可用取决于你的实际网络。`
    : `环境提示：当前浏览器更接近海外或非中文环境（${timezone}）。可优先尝试 ChatGPT 或 Gemini；各服务能否访问仍以你的实际网络为准。`;
}

async function refreshContext() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  status.textContent = "正在读取 XU 页面…";
  preview.value = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://xu.lucifer-cgl.workers.dev/")) {
      throw new Error("请先在当前窗口打开一篇 XU 文章");
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_XU_CONTEXT", mode });
    if (!response?.ok) throw new Error(response?.error || "读取失败");
    activeContext = response.context;
    preview.value = activeContext.content;
    status.textContent = `${activeContext.label} · ${activeContext.content.length.toLocaleString()} 字符${activeContext.truncated ? " · 已截取前 30,000 字符" : ""}`;
  } catch (error) {
    activeContext = null;
    status.textContent = error.message;
  }
}

async function launchProvider(provider) {
  if (!activeContext) {
    showToast("请先成功读取 XU 文章内容");
    return;
  }

  const prompt = buildPrompt();
  try {
    await navigator.clipboard.writeText(prompt);
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_PROVIDER",
      url: provider.url,
      tile: tileWindow.checked
    });
    if (!response?.ok) throw new Error(response?.error || "无法打开 AI 官网");
    showToast(`内容已复制，请在 ${provider.name} 中粘贴发送`);
  } catch (error) {
    showToast(error.message);
  }
}

function buildPrompt() {
  const userQuestion = question.value.trim() || "请解释这段内容的核心概念，给出清晰的学习框架，并指出容易混淆的地方。";
  return [
    "你是我的学习助手。请仅根据下面提供的学习资料回答；资料不足时请明确说明，不要虚构。",
    `文章：${activeContext.title}`,
    `范围：${activeContext.label}`,
    `来源：${activeContext.url}`,
    "",
    `我的问题：${userQuestion}`,
    "",
    "学习资料：",
    activeContext.content
  ].join("\n");
}

async function checkForUpdates() {
  const button = document.querySelector("#check-update");
  button.disabled = true;
  button.textContent = "检查中…";

  try {
    const response = await fetch(`https://raw.githubusercontent.com/Lucifer-cgl/XU-AI-Assistant/main/version.json?t=${Date.now()}`);
    if (!response.ok) throw new Error("版本信息暂不可用");
    const latest = await response.json();
    const currentVersion = chrome.runtime.getManifest().version;

    if (compareVersions(latest.version, currentVersion) > 0) {
      showToast(`发现新版本 v${latest.version}，即将打开下载页`);
      await chrome.tabs.create({ url: latest.downloadUrl });
    } else {
      showToast(`当前已是最新版 v${currentVersion}`);
    }
  } catch (error) {
    showToast(`${error.message}，请稍后再试`);
  } finally {
    button.disabled = false;
    button.textContent = "检查更新";
  }
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

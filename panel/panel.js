const providers = [
  { id: "chatgpt", name: "ChatGPT", note: "OpenAI · 全球", url: "https://chatgpt.com/" },
  { id: "gemini", name: "Gemini", note: "Google · 海外网络", url: "https://gemini.google.com/app" },
  { id: "deepseek", name: "DeepSeek", note: "中国大陆友好", url: "https://chat.deepseek.com/" },
  { id: "qwen", name: "通义千问", note: "中国大陆友好", url: "https://chat.qwen.ai/" },
  { id: "doubao", name: "豆包", note: "字节跳动 · 中国大陆友好", url: "https://www.doubao.com/chat/" }
];

const tileWindow = document.querySelector("#tile-window");
const providerGrid = document.querySelector("#provider-grid");
const versionLabel = document.querySelector("#version-label");
const toast = document.querySelector("#toast");
let toastTimer = null;

init();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CLOSE_PANEL_VIEW") return false;
  window.close();
  return false;
});

window.addEventListener("pagehide", () => {
  chrome.runtime.sendMessage({ type: "PANEL_CLOSED" });
});

async function init() {
  chrome.runtime.sendMessage({ type: "PANEL_OPENED" });
  const version = chrome.runtime.getManifest().version;
  versionLabel.textContent = `v${version}`;
  renderEnvironmentNotice();
  renderProviders();

  const saved = await chrome.storage.local.get(["tileWindow"]);
  if (typeof saved.tileWindow === "boolean") tileWindow.checked = saved.tileWindow;
}

document.querySelector("#check-update").addEventListener("click", checkForUpdates);
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
    ? `环境提示：当前浏览器更接近中国大陆环境（${timezone}）。可优先尝试 DeepSeek、通义千问或豆包；ChatGPT、Gemini 是否可用取决于你的实际网络。`
    : `环境提示：当前浏览器更接近海外或非中文环境（${timezone}）。可优先尝试 ChatGPT 或 Gemini；各服务能否访问仍以你的实际网络为准。`;
}

async function launchProvider(provider) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_PROVIDER",
      url: provider.url,
      tile: tileWindow.checked
    });
    if (!response?.ok) throw new Error(response?.error || "无法打开 AI 官网");
    showToast(`已打开 ${provider.name}`);
  } catch (error) {
    showToast(error.message);
  }
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

const BUTTON_ID = "xu-ai-assistant-trigger";
const MAX_CONTEXT_LENGTH = 30000;
const POSITION_KEY = "triggerPosition";
const DRAG_THRESHOLD = 5;

installTrigger();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_XU_CONTEXT") return false;

  try {
    sendResponse({ ok: true, context: collectContext(message.mode) });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COLLAPSE_XU_TOC") return false;
  const toggle = document.querySelector("#right-panel-toggle");
  if (toggle?.getAttribute("aria-expanded") === "true") toggle.click();
  sendResponse({ ok: true });
  return false;
});

function installTrigger() {
  if (document.getElementById(BUTTON_ID)) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "打开墟 AI 助手");
  button.title = "打开墟 · AI Assistant";
  button.textContent = "墟";
  let dragged = false;
  let dragResetTimer = null;

  restoreTriggerPosition(button);
  setupTriggerDragging(button, () => {
    dragged = true;
    window.clearTimeout(dragResetTimer);
    dragResetTimer = window.setTimeout(() => { dragged = false; }, 500);
  });
  button.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        button.dataset.error = "true";
        button.title = "请点击浏览器工具栏中的扩展图标打开";
        window.setTimeout(() => delete button.dataset.error, 1800);
      }
    });
  });
  document.body.append(button);
}

async function restoreTriggerPosition(button) {
  const saved = await chrome.storage.local.get(POSITION_KEY);
  const position = saved[POSITION_KEY];
  if (!position) return;
  placeTrigger(button, position.x * window.innerWidth, position.y * window.innerHeight);
}

function setupTriggerDragging(button, markDragged) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let isDragging = false;

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    isDragging = false;
    button.setPointerCapture(pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!isDragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    isDragging = true;
    markDragged();
    button.dataset.dragging = "true";
    placeTrigger(button, originLeft + deltaX, originTop + deltaY);
  });

  const finish = async (event) => {
    if (event.pointerId !== pointerId) return;
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    pointerId = null;
    delete button.dataset.dragging;
    if (!isDragging) return;
    const rect = button.getBoundingClientRect();
    await chrome.storage.local.set({
      [POSITION_KEY]: {
        x: rect.left / window.innerWidth,
        y: rect.top / window.innerHeight
      }
    });
  };

  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);
  window.addEventListener("resize", () => {
    if (!button.style.left) return;
    const rect = button.getBoundingClientRect();
    placeTrigger(button, rect.left, rect.top);
  });
}

function placeTrigger(button, requestedLeft, requestedTop) {
  const margin = 8;
  const width = button.offsetWidth || 48;
  const height = button.offsetHeight || 48;
  const left = Math.min(Math.max(margin, requestedLeft), window.innerWidth - width - margin);
  const top = Math.min(Math.max(margin, requestedTop), window.innerHeight - height - margin);
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  button.style.right = "auto";
  button.style.bottom = "auto";
}

function collectContext(mode = "section") {
  const article = document.querySelector(".article");
  if (!article) throw new Error("当前页面没有可读取的 XU 正文");

  const selection = window.getSelection()?.toString().trim() || "";
  let content = "";
  let label = "当前章节";

  if (mode === "selection") {
    if (!selection) throw new Error("请先在正文中选择一段文字");
    content = selection;
    label = "选中内容";
  } else if (mode === "full") {
    content = article.innerText;
    label = "整篇文章";
  } else {
    content = getCurrentSection(article);
  }

  const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
  return {
    title: document.querySelector(".article h1")?.textContent?.trim() || document.title,
    url: location.href,
    label,
    content: normalized.slice(0, MAX_CONTEXT_LENGTH),
    truncated: normalized.length > MAX_CONTEXT_LENGTH
  };
}

function getCurrentSection(article) {
  const headings = [...article.querySelectorAll("h2, h3, h4, h5, h6")];
  if (!headings.length) return article.innerText;

  const anchorLine = 180;
  let current = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= anchorLine) current = heading;
  }

  const level = Number(current.tagName.slice(1));
  const parts = [current.textContent.trim()];
  let node = current.nextElementSibling;
  while (node) {
    if (/^H[2-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
    const text = node.innerText?.trim();
    if (text) parts.push(text);
    node = node.nextElementSibling;
  }
  return parts.join("\n\n");
}

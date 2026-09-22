const BUTTON_ID = "xu-ai-assistant-trigger";
const POSITION_KEY = "triggerPosition";
const COLLAPSED_KEY = "triggerCollapsed";
const DRAG_THRESHOLD = 5;

installTrigger();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PANEL_STATE") return false;
  const button = document.getElementById(BUTTON_ID);
  if (button) setPanelState(button, Boolean(message.open));
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
  let preferredPosition = null;

  restoreTriggerPosition(button, (position) => { preferredPosition = position; });
  restoreCollapsedState(button);
  setupTriggerDragging(button, () => {
    dragged = true;
    window.clearTimeout(dragResetTimer);
    dragResetTimer = window.setTimeout(() => { dragged = false; }, 500);
  }, {
    getPreferredPosition: () => preferredPosition,
    setPreferredPosition: (position) => { preferredPosition = position; }
  });
  button.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (button.dataset.collapsed) {
      setCollapsedState(button, false);
      return;
    }
    const nextOpen = button.dataset.panelOpen !== "true";
    safeSendMessage({ type: nextOpen ? "OPEN_SIDE_PANEL" : "CLOSE_SIDE_PANEL" }, (response) => {
      if (!response?.ok) {
        button.dataset.error = "true";
        button.title = response?.needsRefresh
          ? "扩展已重新加载，请刷新当前 XU 页面"
          : nextOpen ? "请点击浏览器工具栏中的扩展图标打开" : "当前浏览器不允许网页按钮关闭侧边栏";
        window.setTimeout(() => delete button.dataset.error, 1800);
        return;
      }
      setPanelState(button, nextOpen);
    });
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    setCollapsedState(button, !button.dataset.collapsed);
  });
  document.body.append(button);
}

async function restoreTriggerPosition(button, setPreferredPosition) {
  const saved = await safeStorageGet(POSITION_KEY);
  const position = saved[POSITION_KEY];
  if (!position) return;
  setPreferredPosition(position);
  placeTrigger(button, position.x * window.innerWidth, position.y * window.innerHeight);
}

async function restoreCollapsedState(button) {
  const saved = await safeStorageGet(COLLAPSED_KEY);
  const state = saved[COLLAPSED_KEY];
  if (state?.collapsed) applyCollapsedState(button, state.edge || "right");
}

function setupTriggerDragging(button, markDragged, positionStore) {
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
    if (button.dataset.collapsed) setCollapsedState(button, false);
    placeTrigger(button, originLeft + deltaX, originTop + deltaY);
  });

  const finish = async (event) => {
    if (event.pointerId !== pointerId) return;
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    pointerId = null;
    delete button.dataset.dragging;
    if (!isDragging) return;
    const rect = button.getBoundingClientRect();
    const position = {
      x: rect.left / window.innerWidth,
      y: rect.top / window.innerHeight
    };
    positionStore.setPreferredPosition(position);
    await safeStorageSet({ [POSITION_KEY]: position });
  };

  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);
  window.addEventListener("resize", () => {
    if (button.dataset.collapsed) return;
    const position = positionStore.getPreferredPosition();
    if (!position) return;
    placeTrigger(button, position.x * window.innerWidth, position.y * window.innerHeight);
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

function setPanelState(button, open) {
  if (open) {
    button.dataset.panelOpen = "true";
    button.title = "关闭墟 · AI Assistant；右键可缩到边缘";
  } else {
    delete button.dataset.panelOpen;
    button.title = "打开墟 · AI Assistant；右键可缩到边缘";
  }
}

function setCollapsedState(button, collapsed) {
  if (!collapsed) {
    delete button.dataset.collapsed;
    safeStorageSet({ [COLLAPSED_KEY]: { collapsed: false } });
    button.title = button.dataset.panelOpen === "true" ? "关闭墟 · AI Assistant；右键可缩到边缘" : "打开墟 · AI Assistant；右键可缩到边缘";
    return;
  }
  const rect = button.getBoundingClientRect();
  const edge = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
  applyCollapsedState(button, edge);
  safeStorageSet({ [COLLAPSED_KEY]: { collapsed: true, edge } });
}

function applyCollapsedState(button, edge) {
  button.dataset.collapsed = edge;
  button.title = "墟 · AI Assistant 已缩到边缘；左键或右键恢复";
}

function safeSendMessage(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        callback({ ok: false, needsRefresh: isExtensionContextInvalidated(chrome.runtime.lastError) });
        return;
      }
      callback(response);
    });
  } catch (error) {
    callback({ ok: false, needsRefresh: isExtensionContextInvalidated(error), error: error.message });
  }
}

async function safeStorageGet(key) {
  try {
    return await chrome.storage.local.get(key);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return {};
    throw error;
  }
}

async function safeStorageSet(value) {
  try {
    await chrome.storage.local.set(value);
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) throw error;
  }
}

function isExtensionContextInvalidated(error) {
  return /Extension context invalidated/i.test(String(error?.message || error));
}

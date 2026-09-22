const layoutKey = (windowId) => `xuAiLayout:${windowId}`;

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn("无法设置侧边栏行为", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_SIDE_PANEL") {
    openSidePanel(sender).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "CLOSE_SIDE_PANEL") {
    closeSidePanel().then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "PANEL_OPENED" || message?.type === "PANEL_CLOSED") {
    notifyActiveXuTab({ type: "PANEL_STATE", open: message.type === "PANEL_OPENED" });
    return false;
  }

  if (message?.type === "OPEN_PROVIDER") {
    openProviderWindow(message.url, message.tile !== false)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const key = layoutKey(windowId);
  const stored = await chrome.storage.session.get(key);
  const record = stored[key];
  if (!record) return;
  await chrome.storage.session.remove(key);

  try {
    if (record.state && record.state !== "normal") {
      await chrome.windows.update(record.sourceWindowId, { state: record.state });
    } else {
      await chrome.windows.update(record.sourceWindowId, record.bounds);
    }
  } catch {
    // 原窗口可能已被用户关闭，不需要继续恢复。
  }
});

async function openSidePanel(sender) {
  if (sender.tab?.id) {
    await chrome.sidePanel.open({ tabId: sender.tab.id });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前页面");
  await chrome.sidePanel.open({ tabId: tab.id });
}

async function closeSidePanel() {
  await chrome.runtime.sendMessage({ type: "CLOSE_PANEL_VIEW" });
}

async function notifyActiveXuTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // 当前活动页可能不是 XU，忽略即可。
  }
}

async function openProviderWindow(url, tile) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") throw new Error("仅允许打开 HTTPS AI 官网");

  const source = await chrome.windows.getCurrent();
  const workArea = await getWindowWorkArea(source);
  const canTile = tile && workArea.width >= 1280 && workArea.height >= 680;
  const assistantWidth = canTile
    ? Math.max(460, Math.min(760, Math.floor(workArea.width * 0.3)))
    : 520;
  const xuWidth = canTile ? workArea.width - assistantWidth : source.width;
  const assistantHeight = canTile ? workArea.height : Math.max(620, (source.height || 780) - 24);
  let sourceBounds = null;

  if (canTile) {
    sourceBounds = {
      left: source.left,
      top: source.top,
      width: source.width,
      height: source.height
    };
    if (source.state !== "normal") {
      await chrome.windows.update(source.id, { state: "normal" });
    }
    await chrome.windows.update(source.id, {
      left: workArea.left,
      top: workArea.top,
      width: xuWidth,
      height: workArea.height
    });
  }

  try {
    const popup = await chrome.windows.create({
      url,
      type: "popup",
      focused: true,
      width: assistantWidth,
      height: assistantHeight,
      left: canTile ? workArea.left + xuWidth : undefined,
      top: canTile ? workArea.top : undefined
    });

    if (sourceBounds && popup.id) {
      await chrome.storage.session.set({
        [layoutKey(popup.id)]: { sourceWindowId: source.id, bounds: sourceBounds, state: source.state }
      });
    }

    return { tiled: canTile };
  } catch (error) {
    if (sourceBounds) {
      if (source.state && source.state !== "normal") await chrome.windows.update(source.id, { state: source.state });
      else await chrome.windows.update(source.id, sourceBounds);
    }
    throw error;
  }
}

async function getWindowWorkArea(source) {
  const fallback = {
    left: source.left || 0,
    top: source.top || 0,
    width: source.width || 1366,
    height: source.height || 768
  };

  try {
    const displays = await chrome.system.display.getInfo();
    const centerX = fallback.left + fallback.width / 2;
    const centerY = fallback.top + fallback.height / 2;
    const display = displays.find(({ bounds }) =>
      centerX >= bounds.left && centerX < bounds.left + bounds.width &&
      centerY >= bounds.top && centerY < bounds.top + bounds.height
    ) || displays.find(({ isPrimary }) => isPrimary) || displays[0];
    return display?.workArea || fallback;
  } catch {
    return fallback;
  }
}

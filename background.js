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

async function openProviderWindow(url, tile) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") throw new Error("仅允许打开 HTTPS AI 官网");

  const source = await chrome.windows.getCurrent();
  const canTile = tile && Number.isFinite(source.width) && source.width >= 1000;
  const assistantWidth = canTile
    ? Math.max(460, Math.min(620, Math.floor(source.width * 0.38)))
    : 520;
  const assistantHeight = Math.max(620, (source.height || 780) - 24);
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
      left: source.left,
      top: source.top,
      width: source.width - assistantWidth,
      height: source.height
    });
  }

  try {
    const popup = await chrome.windows.create({
      url,
      type: "popup",
      focused: true,
      width: assistantWidth,
      height: assistantHeight,
      left: canTile ? source.left + source.width - assistantWidth : undefined,
      top: canTile ? source.top : undefined
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

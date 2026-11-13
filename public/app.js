const elements = {
  addressForm: document.querySelector("#address-form"), address: document.querySelector("#address-input"), back: document.querySelector("#back-button"), forward: document.querySelector("#forward-button"), reload: document.querySelector("#reload-button"), bookmarkPage: document.querySelector("#bookmark-page"), splitButton: document.querySelector("#split-button"), fullscreenButton: document.querySelector("#fullscreen-button"),
  tabs: document.querySelector("#tab-list"), frames: document.querySelector("#frames"), startPage: document.querySelector("#start-page"), newTab: document.querySelector("#new-tab-button"), sidebar: document.querySelector("#sidebar"), sidebarToggle: document.querySelector("#sidebar-toggle"),
  settings: document.querySelector("#settings-modal"), settingsButton: document.querySelector("#settings-button"), settingsForm: document.querySelector("#settings-form"), searchEngine: document.querySelector("#search-engine"), wispUrl: document.querySelector("#wisp-url"), cloak: document.querySelector("#cloak-toggle"), glass: document.querySelector("#glass-toggle"), motion: document.querySelector("#motion-toggle"), recentsToggle: document.querySelector("#recents-toggle"), connection: document.querySelector("#connection-state"),
  status: document.querySelector("#status-pill"), clock: document.querySelector("#clock"), greeting: document.querySelector("#greeting"), startSearchForm: document.querySelector("#start-search-form"), startSearch: document.querySelector("#start-search-input"), suggestions: document.querySelector("#search-suggestions"), recentGrid: document.querySelector("#recent-grid"), clearRecents: document.querySelector("#clear-recents"),
  clearData: document.querySelector("#clear-data")
};

const SEARCH_ENGINES = { duckduckgo: "https://duckduckgo.com/?q=", google: "https://www.google.com/search?q=", brave: "https://search.brave.com/search?q=" };
const DEFAULT_SETTINGS = { transport: "libcurl", searchEngine: "duckduckgo", wispUrl: "wss://justforfun.eagler.host", cloak: false, theme: "aurora", glass: true, reducedMotion: false, recents: true };
function readStored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function escapeText(value) { return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character])); }
let settings = { ...DEFAULT_SETTINGS, ...readStored("polestar-settings", {}) };
let recentPages = readStored("polestar-recents", []);
let bookmarks = readStored("polestar-bookmarks", []);
let controller;  let engineReady = false; let activeTabId; let splitTabId; let tabCount = 0;
const tabs = [];


function updateClock() { const now = new Date(); elements.clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); const hour = now.getHours(); elements.greeting.textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
function isUrl(value) { return /^(https?:\/\/|localhost(?::\d+)?(?:\/|$)|(?:[\w-]+\.)+[a-z]{2,}(?:\/|$))/i.test(value); }
function resolveInput(value) { const trimmed = value.trim(); if (!trimmed) return null; if (isUrl(trimmed)) return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`; return `${SEARCH_ENGINES[settings.searchEngine]}${encodeURIComponent(trimmed)}`; }
function labelForUrl(url) { try { return new URL(url).hostname.replace(/^www\./, "") || "New Tab"; } catch { return "New Tab"; } }
function faviconForUrl(url) { try { return `/api/favicon?domain=${encodeURIComponent(new URL(url).hostname)}`; } catch { return ""; } }
function updateDocumentCloak() { document.title = settings.cloak ? "New Tab" : "Polestar — Private browsing, beautifully arranged"; }
function applyAppearance() { document.body.dataset.theme = settings.theme; document.body.classList.toggle("no-glass", !settings.glass); document.body.classList.toggle("reduce-motion", settings.reducedMotion); document.querySelector("meta[name=theme-color]").content = settings.theme === "frost" ? "#1d2640" : "#08080c"; }
function setStartPlaceholder() { const name = settings.searchEngine === "duckduckgo" ? "DuckDuckGo" : settings.searchEngine === "google" ? "Google" : "Brave"; elements.startSearch.placeholder = `Search with ${name} or enter URL`; }
function updateStatus(ready) { elements.status.classList.toggle("ready", ready); elements.status.querySelector("span").textContent = ready ? "Wisp Connected · Scramjet Ready" : "Connecting to Polestar Wisp…"; elements.connection.classList.toggle("ready", ready); elements.connection.lastChild.textContent = ready ? " Wisp connected — Scramjet transport ready" : " Checking Polestar Wisp status…"; }
function renderIcons() { window.lucide?.createIcons({ icons: window.lucide.icons, attrs: { "stroke-width": 1.8 } }); }
function activeTab() { return tabs.find((tab) => tab.id === activeTabId); }
function updateBookmarkButton() { const tab = activeTab(); const bookmarked = tab?.url && bookmarks.some((bookmark) => bookmark.url === tab.url); elements.bookmarkPage.classList.toggle("selected-control", Boolean(bookmarked)); elements.bookmarkPage.title = bookmarked ? "Remove favorite" : "Favorite page"; elements.bookmarkPage.querySelector("span").textContent = bookmarked ? "Remove favorite" : "Favorite page"; }
function renderSuggestions(query = "") { const search = query.trim().toLowerCase(); const candidates = recentPages.filter((page) => page.title.toLowerCase().includes(search) || page.url.toLowerCase().includes(search)).slice(0, 4); elements.suggestions.replaceChildren(); if (!search) { elements.suggestions.classList.remove("visible"); return; } const createSuggestion = (label, value, icon) => { const button = document.createElement("button"); button.type = "button"; button.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeText(label)}</span>`; button.addEventListener("click", () => { navigateActive(value); elements.startSearch.value = ""; elements.suggestions.classList.remove("visible"); }); elements.suggestions.append(button); }; candidates.forEach((page) => createSuggestion(page.title, page.url, "history")); createSuggestion(`Search ${settings.searchEngine} for “${query.trim()}”`, query, "search"); elements.suggestions.classList.add("visible"); renderIcons(); }

function renderRecents() {
  elements.recentGrid.replaceChildren();
  if (!settings.recents || !recentPages.length) { const message = document.createElement("p"); message.className = "empty-recents"; message.textContent = settings.recents ? "Sites you visit will appear here." : "Recent pages are disabled in Privacy settings."; elements.recentGrid.append(message); return; }
  recentPages.slice(0, 6).forEach((page) => { const button = document.createElement("button"); button.className = "recent-card"; const image = document.createElement("img"); image.src = faviconForUrl(page.url); image.alt = ""; image.onerror = () => { image.replaceWith(Object.assign(document.createElement("span"), { className: "recent-fallback", textContent: "✦" })); }; const name = document.createElement("span"); name.textContent = page.title; button.append(image, name); button.addEventListener("click", () => navigateActive(page.url)); elements.recentGrid.append(button); });
}
function renderBookmarks() {
  const section = document.querySelector(".bookmarks");
  section.querySelectorAll(".bookmark-row").forEach((node) => node.remove());
  bookmarks.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bookmark-row";
    const button = document.createElement("button");
    button.className = "bookmark dynamic";
    button.title = item.url;
    button.innerHTML = `<span class="bookmark-icon"><img src="${faviconForUrl(item.url)}" alt=""></span><span>${escapeText(item.title)}</span>`;
    button.addEventListener("click", () => navigateActive(item.url));
    const remove = document.createElement("button");
    remove.className = "remove-link";
    remove.title = `Remove ${item.title}`;
    remove.setAttribute("aria-label", remove.title);
    remove.innerHTML = '<i data-lucide="x"></i>';
    remove.addEventListener("click", () => {
      bookmarks = bookmarks.filter((bookmark) => bookmark.url !== item.url);
      localStorage.setItem("polestar-bookmarks", JSON.stringify(bookmarks));
      renderBookmarks();
      updateBookmarkButton();
    });
    row.append(button, remove);
    section.append(row);
  });
  renderIcons();
}
function rememberPage(url) { if (!settings.recents || !/^https?:/i.test(url)) return; const title = labelForUrl(url); recentPages = [{ url, title }, ...recentPages.filter((page) => page.url !== url)].slice(0, 12); localStorage.setItem("polestar-recents", JSON.stringify(recentPages)); renderRecents(); }

async function createTransport(config) {
  const module = config.transport === "epoxy" ? await import("/epoxy/index.mjs") : await import("/libcurl/index.mjs");
  const transport = new module.default({ wisp: config.wispUrl });
  await transport.init();
  return transport;
}

async function initializeEngine() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    const transport = await createTransport(settings);
    const api = window.$scramjetController; const utils = window.$scramjetUtils;
    controller = new api.Controller({ serviceworker: navigator.serviceWorker.controller || registration.active, transport, config: { scramjetPath: "/scram/scramjet.js", wasmPath: "/scram/scramjet.wasm", injectPath: "/controller/controller.inject.js" } });
    await controller.wait(); engineReady = true; window.polestarUtils = utils; checkWisp(); tabs.filter((tab) => !tab.isNewTab).forEach((tab) => navigateTab(tab, tab.url));
  } catch (error) { console.error("Polestar engine failed to initialize", error); updateStatus(false); }
}

function createTab(url = null) { const tab = { id: `tab-${++tabCount}`, url, title: url ? labelForUrl(url) : "New Tab", frame: null, isNewTab: !url }; tabs.push(tab); switchTab(tab.id); if (url) navigateTab(tab, url); return tab; }
function switchTab(id) { const previous = activeTabId; if (id === splitTabId) splitTabId = previous; activeTabId = id; const tab = activeTab(); if (!tab) return; if (!tabs.some((item) => item.id === splitTabId)) splitTabId = undefined; elements.frames.classList.toggle("split", Boolean(splitTabId && tab.frame)); elements.startPage.classList.toggle("hidden", !tab.isNewTab); tabs.forEach((item) => { item.frame?.element.classList.toggle("active", item.id === id); item.frame?.element.classList.toggle("split-secondary", item.id === splitTabId); }); elements.address.value = tab.isNewTab ? "polestar://newtab" : tab.url; renderTabs(); updateBookmarkButton(); }
function closeTab(id) { const index = tabs.findIndex((tab) => tab.id === id); if (index === -1) return; const [tab] = tabs.splice(index, 1); tab.frame?.element.remove(); if (activeTabId === id) { const next = tabs[index] || tabs[index - 1] || createTab(); if (next.id !== activeTabId) switchTab(next.id); } switchTab(activeTabId); }
function renderTabs() { elements.tabs.replaceChildren(...tabs.map((tab) => { const button = document.createElement("button"); button.className = `tab-item ${tab.id === activeTabId ? "active" : ""}`; button.draggable = true; button.dataset.tabId = tab.id; const favicon = document.createElement("span"); favicon.className = "tab-favicon"; if (tab.isNewTab) favicon.innerHTML = '<i data-lucide="sparkles"></i>'; else { const image = document.createElement("img"); image.src = faviconForUrl(tab.url); image.alt = ""; image.onerror = () => { favicon.innerHTML = '<i data-lucide="globe-2"></i>'; renderIcons(); }; favicon.append(image); } const title = document.createElement("span"); title.className = "tab-title"; title.textContent = tab.title; const close = document.createElement("span"); close.className = "close-tab"; close.setAttribute("aria-label", "Close tab"); close.textContent = "×"; button.append(favicon, title, close); button.addEventListener("click", (event) => event.target.closest(".close-tab") ? closeTab(tab.id) : switchTab(tab.id)); button.addEventListener("dragstart", () => button.classList.add("dragging")); button.addEventListener("dragend", () => button.classList.remove("dragging")); button.addEventListener("dragover", (event) => event.preventDefault()); button.addEventListener("drop", (event) => { event.preventDefault(); const dragged = document.querySelector(".tab-item.dragging")?.dataset.tabId; if (dragged && dragged !== tab.id) { const from = tabs.findIndex((item) => item.id === dragged); const to = tabs.findIndex((item) => item.id === tab.id); tabs.splice(to, 0, tabs.splice(from, 1)[0]); renderTabs(); } }); return button; })); renderIcons(); }
function ensureFrame(tab) { if (tab.frame || !engineReady) return; const iframe = document.createElement("iframe"); iframe.title = tab.title; iframe.loading = "eager"; iframe.addEventListener("load", () => { try { const title = iframe.contentDocument?.title; if (title) { tab.title = title; iframe.title = title; const recent = recentPages.find((page) => page.url === tab.url); if (recent) { recent.title = title; localStorage.setItem("polestar-recents", JSON.stringify(recentPages)); renderRecents(); } renderTabs(); } } catch {} }); elements.frames.append(iframe); const utils = window.polestarUtils; tab.frame = controller.createFrame(iframe, { plugins: [new utils.HttpCachePlugin(), new utils.UrlWatcherPlugin((url) => { tab.url = url; tab.title = labelForUrl(url); tab.isNewTab = false; iframe.title = tab.title; rememberPage(url); if (activeTabId === tab.id) elements.address.value = url; renderTabs(); }), new utils.CatchEscapedLinksPlugin((url) => { createTab(url.href); return new URL(location.href); })] }); }
function navigateTab(tab, url) { if (!url) return; tab.url = url; tab.title = labelForUrl(url); tab.isNewTab = false; rememberPage(url); if (!engineReady) { elements.startPage.classList.add("hidden"); renderTabs(); return; } ensureFrame(tab); tab.frame.go(url); switchTab(tab.id); }
function navigateActive(value) { const url = resolveInput(value); const tab = tabs.find((item) => item.id === activeTabId); if (url && tab) navigateTab(tab, url); }
function activeFrameAction(action) { const tab = tabs.find((item) => item.id === activeTabId); if (tab?.frame && typeof tab.frame[action] === "function") tab.frame[action](); }
function toggleBookmark() { const tab = activeTab(); if (!tab?.url || tab.isNewTab) return; const index = bookmarks.findIndex((bookmark) => bookmark.url === tab.url); if (index >= 0) bookmarks.splice(index, 1); else bookmarks.unshift({ url: tab.url, title: tab.title }); localStorage.setItem("polestar-bookmarks", JSON.stringify(bookmarks)); renderBookmarks(); updateBookmarkButton(); }
function toggleSplitScreen() { if (splitTabId) { splitTabId = undefined; } else { const other = tabs.find((tab) => tab.frame && tab.id !== activeTabId); if (!other || !activeTab()?.frame) return toast("Open two websites, then choose split view."); splitTabId = other.id; } switchTab(activeTabId); }
async function toggleFullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast("Fullscreen is unavailable in this browser."); } }
async function applySettings() { const next = { ...settings, transport: document.querySelector("#proxy-transport").value, searchEngine: elements.searchEngine.value, wispUrl: elements.wispUrl.value.trim() || DEFAULT_SETTINGS.wispUrl, cloak: elements.cloak.checked, theme: document.querySelector("input[name=theme]:checked").value, glass: elements.glass.checked, reducedMotion: elements.motion.checked, recents: elements.recentsToggle.checked };
  const save = document.querySelector("#save-settings");
  save.disabled = true;
  try {
    if (controller && (next.transport !== settings.transport || next.wispUrl !== settings.wispUrl)) {
      const transport = await createTransport(next);
      controller.setTransport(transport);
    }
    settings = next;
    localStorage.setItem("polestar-settings", JSON.stringify(settings)); updateDocumentCloak(); applyAppearance(); setStartPlaceholder(); renderRecents(); elements.settings.close();
  } catch (error) {
    toast("Could not switch transport. Your previous settings are unchanged.");
    console.error("Polestar transport switch failed", error);
  } finally { save.disabled = false; }
}
function populateSettings() { document.querySelector("#proxy-transport").value = settings.transport; elements.searchEngine.value = settings.searchEngine; elements.wispUrl.value = settings.wispUrl; elements.cloak.checked = settings.cloak; elements.glass.checked = settings.glass; elements.motion.checked = settings.reducedMotion; elements.recentsToggle.checked = settings.recents; document.querySelector(`input[name=theme][value=${settings.theme}]`).checked = true; }

elements.addressForm.addEventListener("submit", (event) => { event.preventDefault(); navigateActive(elements.address.value); });
elements.startSearchForm.addEventListener("submit", (event) => { event.preventDefault(); navigateActive(elements.startSearch.value); elements.startSearch.value = ""; });
elements.newTab.addEventListener("click", () => createTab()); elements.back.addEventListener("click", () => activeFrameAction("back")); elements.forward.addEventListener("click", () => activeFrameAction("forward")); elements.reload.addEventListener("click", () => activeFrameAction("reload")); elements.bookmarkPage.addEventListener("click", toggleBookmark); elements.splitButton.addEventListener("click", toggleSplitScreen); elements.fullscreenButton.addEventListener("click", toggleFullscreen); elements.sidebarToggle.addEventListener("click", () => elements.sidebar.classList.toggle("collapsed"));
document.querySelectorAll("[data-url]").forEach((button) => button.addEventListener("click", () => navigateActive(button.dataset.url)));
elements.settingsButton.addEventListener("click", () => { populateSettings(); elements.settings.showModal(); }); elements.settingsForm.addEventListener("submit", (event) => { if (event.submitter?.id === "save-settings") { event.preventDefault(); applySettings(); } }); document.querySelectorAll(".settings-tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".settings-tab,.settings-pane").forEach((item) => item.classList.toggle("active", item.dataset.pane === tab.dataset.pane)); }));
elements.clearRecents.addEventListener("click", () => { recentPages = []; localStorage.removeItem("polestar-recents"); renderRecents(); }); elements.clearData.addEventListener("click", () => { recentPages = []; localStorage.removeItem("polestar-recents"); renderRecents(); });
elements.startSearch.addEventListener("input", () => renderSuggestions(elements.startSearch.value)); elements.startSearch.addEventListener("blur", () => setTimeout(() => elements.suggestions.classList.remove("visible"), 140)); document.addEventListener("fullscreenchange", () => { const icon = elements.fullscreenButton.querySelector("svg"); if (icon) { icon.outerHTML = `<i data-lucide="${document.fullscreenElement ? "minimize" : "maximize"}"></i>`; renderIcons(); } });
window.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "t") { event.preventDefault(); createTab(); } });

function toast(message) {
  document.querySelector(".toast")?.remove();
  const notice = document.createElement("div");
  notice.className = "toast";
  notice.setAttribute("role", "status");
  notice.textContent = message;
  document.body.append(notice);
  setTimeout(() => notice.remove(), 4000);
}
let connectionGeneration = 0;
function checkWisp() {
  const generation = ++connectionGeneration;
  let socket;
  const report = (connected) => {
    if (generation !== connectionGeneration) return;
    updateStatus(connected && engineReady);
    if (!connected) {
      elements.status.querySelector("span").textContent = "Wisp unavailable · check Settings";
      elements.connection.lastChild.textContent = " Wisp unavailable — check the server URL";
    }
  };
  try {
    socket = new WebSocket(settings.wispUrl);
    socket.binaryType = "arraybuffer";
    const timeout = setTimeout(() => { report(false); socket.close(); }, 7000);
    socket.addEventListener("message", (event) => { const data = new Uint8Array(event.data); if (data[0] === 3) { clearTimeout(timeout); report(true); socket.close(); } });
    socket.addEventListener("error", () => { clearTimeout(timeout); report(false); });
  } catch { report(false); }
}
elements.settings.addEventListener("close", () => { if (engineReady) checkWisp(); });

document.querySelectorAll("[data-url]").forEach((button) => {
  const holder = button.querySelector(".brand,.quick-icon,.bookmark-icon");
  if (!holder) return;
  const image = document.createElement("img");
  image.alt = "";
  image.src = faviconForUrl(button.dataset.url);
  image.addEventListener("error", () => { holder.innerHTML = '<i data-lucide="globe"></i>'; renderIcons(); });
  holder.replaceChildren(image);
});
document.querySelectorAll("button[title]").forEach((button) => button.setAttribute("aria-label", button.title));
elements.clearData.textContent = "Clear recent pages";
document.querySelectorAll("input[name=theme]").forEach((radio) => radio.addEventListener("change", () => { document.body.dataset.theme = radio.value; }));
elements.settings.addEventListener("close", applyAppearance);
elements.wispUrl.addEventListener("input", () => elements.wispUrl.setCustomValidity(/^wss?:\/\//.test(elements.wispUrl.value) ? "" : "Enter a ws:// or wss:// address."));
elements.startSearch.addEventListener("keydown", (event) => { if (event.key === "Escape") elements.suggestions.classList.remove("visible"); if (event.key === "ArrowDown") { event.preventDefault(); elements.suggestions.querySelector("button")?.focus(); } });
const divider = document.createElement("div");
divider.className = "split-divider";
divider.setAttribute("role", "separator");
divider.setAttribute("aria-label", "Resize split view");
divider.tabIndex = 0;
elements.frames.append(divider);
divider.addEventListener("pointerdown", (event) => { divider.setPointerCapture(event.pointerId); elements.frames.classList.add("resizing"); });
divider.addEventListener("pointermove", (event) => { if (!divider.hasPointerCapture(event.pointerId)) return; const bounds = elements.frames.getBoundingClientRect(); elements.frames.style.setProperty("--split-width", `${Math.min(75, Math.max(25, (event.clientX - bounds.left) / bounds.width * 100))}%`); });
divider.addEventListener("pointerup", () => elements.frames.classList.remove("resizing"));
divider.addEventListener("lostpointercapture", () => elements.frames.classList.remove("resizing"));
divider.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const width = parseFloat(elements.frames.style.getPropertyValue("--split-width")) || 50; elements.frames.style.setProperty("--split-width", `${Math.max(25, Math.min(75, width + (event.key === "ArrowLeft" ? -5 : 5)))}%`); });
updateClock(); setInterval(updateClock, 1000); updateDocumentCloak(); applyAppearance(); setStartPlaceholder(); renderRecents(); renderBookmarks(); renderIcons(); createTab(); initializeEngine();
const moreButton = document.querySelector("#more-button");
const shortcutDialog = document.querySelector("#shortcut-editor");
const shortcutFields = document.querySelector("#shortcut-fields");
const shortcutGroups = [
  { key: "polestar-pinned", container: document.querySelector(".pinned-apps"), title: "Pinned shortcuts" },
  { key: "polestar-start-shortcuts", container: document.querySelector(".quick-access"), title: "Start page shortcuts" }
];
let editingGroup;
shortcutGroups.forEach((group) => {
  const defaults = [...group.container.querySelectorAll("[data-url]")].map((button) => ({ title: button.title || button.textContent.trim(), url: button.dataset.url }));
  group.items = readStored(group.key, defaults);
  renderShortcuts(group);
});
function renderShortcuts(group) {
  group.container.replaceChildren();
  group.items.forEach((item) => {
    const button = document.createElement("button");
    button.className = group.key === "polestar-pinned" ? "app-tile" : "";
    button.title = item.title;
    button.setAttribute("aria-label", item.title);
    const image = document.createElement("img");
    image.src = faviconForUrl(item.url);
    image.alt = "";
    image.addEventListener("error", () => { image.replaceWith(Object.assign(document.createElement("span"), { textContent: "✦" })); });
    button.append(image);
    if (group.key !== "polestar-pinned") button.append(Object.assign(document.createElement("span"), { textContent: item.title }));
    button.addEventListener("click", () => navigateActive(item.url));
    group.container.append(button);
  });
}
function addShortcutFields(item = { title: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "shortcut-edit-row";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const name = document.createElement("input");
  name.name = "shortcut-name";
  name.required = true;
  name.maxLength = 50;
  name.value = item.title;
  nameLabel.append(name);
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Website";
  const url = document.createElement("input");
  url.name = "shortcut-url";
  url.required = true;
  url.placeholder = "https://example.com";
  url.value = item.url;
  url.addEventListener("input", () => url.setCustomValidity(""));
  urlLabel.append(url);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-link";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove shortcut");
  remove.addEventListener("click", () => row.remove());
  row.append(nameLabel, urlLabel, remove);
  shortcutFields.append(row);
}
function editShortcuts(group) {
  editingGroup = group;
  shortcutDialog.querySelector("h2").textContent = group.title;
  shortcutFields.replaceChildren();
  group.items.forEach(addShortcutFields);
  shortcutDialog.showModal();
}
document.querySelector("#edit-pinned").addEventListener("click", () => editShortcuts(shortcutGroups[0]));
const editStart = document.createElement("button");
editStart.className = "edit-start-shortcuts";
editStart.textContent = "Edit shortcuts";
editStart.addEventListener("click", () => editShortcuts(shortcutGroups[1]));
shortcutGroups[1].container.after(editStart);
document.querySelector("#add-shortcut").addEventListener("click", () => addShortcutFields());
["#close-shortcuts", "#cancel-shortcuts"].forEach((selector) => document.querySelector(selector).addEventListener("click", () => shortcutDialog.close()));
document.querySelector("#shortcut-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const items = [];
  for (const row of shortcutFields.children) {
    const urlInput = row.querySelector('[name="shortcut-url"]');
    try {
      const value = urlInput.value.trim();
      const url = new URL(value.includes(":") ? value : `https://${value}`);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      items.push({ title: row.querySelector('[name="shortcut-name"]').value.trim() || url.hostname, url: url.href });
    } catch {
      urlInput.setCustomValidity("Enter an HTTP or HTTPS website address.");
      urlInput.reportValidity();
      return;
    }
  }
  editingGroup.items = items;
  localStorage.setItem(editingGroup.key, JSON.stringify(items));
  renderShortcuts(editingGroup);
  shortcutDialog.close();
});
const moreMenu = document.querySelector("#more-menu");
function closeMoreMenu(restoreFocus = false) {
  moreMenu.hidden = true;
  moreButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) moreButton.focus();
}
moreButton.addEventListener("click", () => {
  moreMenu.hidden = !moreMenu.hidden;
  moreButton.setAttribute("aria-expanded", String(!moreMenu.hidden));
});
moreMenu.addEventListener("click", (event) => {
  if (event.target.closest("button")) closeMoreMenu(true);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".more-controls")) closeMoreMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !moreMenu.hidden) closeMoreMenu(true);
});
document.addEventListener("focusin", (event) => {
  if (!event.target.closest(".more-controls")) closeMoreMenu();
});


// ==UserScript==
// @name         🔍 聚合搜索
// @description  DDG/Google/cn.Bing 悬浮工具栏：支持引擎切换、自动翻页、深色模式、一键回顶、拖拽记忆与 ESC 快捷隐藏。
// @version      2.1.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        *://duckduckgo.com/*
// @match        *://*.google.com*/search*
// @match        *://cn.bing.com/search*
// @grant        GM_xmlhttpRequest
// @connect      duckduckgo.com
// @connect      google.com
// @connect      google.com.hk
// @connect      google.co.jp
// @connect      cn.bing.com
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// ==/UserScript==

!(function () {
  "use strict";

  const CONFIG = {
    MAX_PAGE: 25,
    MAX_DOM_RESULTS: 150,
    TIMEOUT: 10000,
    FAIL_LIMIT: 3,
    FETCH_DELAY_MIN: 400,
    FETCH_DELAY_MAX: 900,
    SCROLL_THRESHOLD: 600,
    TRIGGER_COOLDOWN: 1200,
    URL_CHECK_INTERVAL: 250,
    RESET_DELAY: 300,
    RESET_GUARD: 1500,
    SCROLL_AFTER_RESET: 20,
    SCROLL_DEBOUNCE: 250,
    PERIODIC_CHECK: 1200
  };

  const storage = {
    get(k, f) { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : f; } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const ENGINES = [
    {
      name: "DDG", url: "https://duckduckgo.com/", test: /duckduckgo\.com/,
      pageParam: "s", pageStep: 50, pageBase: 0, auto: false, icon: "🦆", color: "#FF9800",
      getResults: doc => Array.from(doc.querySelectorAll(".result, .react-results--main .result")),
      getContainer: doc => doc.querySelector(".results, .react-results--main") || doc.querySelector(".result")?.parentElement
    },
    {
      name: "Google", url: "https://www.google.com/search", test: /google\./,
      pageParam: "start", pageStep: 10, pageBase: 0, auto: true, icon: "🔍", color: "#2196F3",
      getResults: doc => {
        const primary = Array.from(doc.querySelectorAll(".MjjYud"));
        return (primary.length ? primary : Array.from(doc.querySelectorAll(".g"))).filter(el => el.querySelector("h3"));
      },
      getContainer: doc => doc.querySelector(".MjjYud")?.parentElement || doc.querySelector(".g")?.parentElement || doc.querySelector("#search")
    },
    {
      name: "Bing", url: "https://cn.bing.com/search", test: /cn\.bing\.com.*\/search/,
      pageParam: "first", pageStep: 10, pageBase: 1, auto: true, icon: "🅱️", color: "#008080",
      getResults: doc => Array.from(doc.querySelectorAll("#b_results > li.b_algo, #b_results .b_algo")),
      getContainer: doc => {
        const byId = doc.querySelector("#b_results");
        if (byId) return byId;
        const first = doc.querySelector("li.b_algo, .b_algo");
        if (first) {
          let el = first.parentElement;
          while (el && el !== doc.body) {
            if (el.tagName === "OL" || el.tagName === "UL") return el;
            el = el.parentElement;
          }
          return first.parentElement;
        }
        return doc.querySelector("main");
      },
      getCurrentPageFromUI: doc => {
        const selectors = [
          ".b_pag li.b_active", ".b_pag .b_active",
          ".b_pag .sb_pagS", ".b_pag .sb_pagS_bp",
          '.b_pag [aria-current="page"]', ".b_pag a.active",
          ".sb_pag li.b_active", ".sb_pag .b_active"
        ];
        for (const s of selectors) {
          const el = doc.querySelector(s);
          if (el) {
            const n = parseInt((el.textContent || "").trim(), 10);
            if (!isNaN(n) && n > 0) return n;
          }
        }
        return null;
      }
    }
  ];

  const engine = ENGINES.find(e => e.test.test(location.href));
  if (!engine) return;

  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let autoPage = storage.get("sa_auto_v2.1", true);
  let isLoading = false, failCount = 0, activeXhr = null;
  let totalCount = 0;
  let currentPage = 1;
  let lastTrigger = 0;
  let toggleUpdate = () => {};
  let generation = 0;
  let canAutoLoad = true;
  let resetGuardUntil = 0;
  let resetScrollY = 0;
  let pendingBottomCheck = false;
  let pendingCheck = false;
  let lastY = 0;
  const seenHrefs = new Set();

  function getHref(el) {
    const a = el.querySelector("a[href]");
    if (!a) return null;
    try { return new URL(a.href, location.href).href.split("#")[0]; } catch { return a.href; }
  }

  function resolveContainer() {
    return engine.getContainer(document);
  }

  function computePageFromUrl() {
    const p = new URLSearchParams(location.search);
    const raw = parseInt(p.get(engine.pageParam)) || 0;
    return Math.max(1, Math.floor((raw - engine.pageBase) / engine.pageStep) + 1);
  }

  function detectCurrentPage() {
    if (engine.getCurrentPageFromUI) {
      const ui = engine.getCurrentPageFromUI(document);
      if (ui != null) return ui;
    }
    return computePageFromUrl();
  }

  function collectCurrentPage() {
    seenHrefs.clear();
    const items = engine.getResults(document);
    totalCount = items.length;
    items.forEach(el => { const h = getHref(el); if (h) seenHrefs.add(h); });
  }

  function updatePgUI(text) {
    const pgEl = document.getElementById("sa-pg");
    if (pgEl) pgEl.textContent = text || `📄 第 ${currentPage} 页`;
  }

  function isNearBottom() {
    const scrollPos = window.scrollY + window.innerHeight;
    const docHeight = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    return (docHeight - scrollPos) < CONFIG.SCROLL_THRESHOLD;
  }

  function resetState() {
    generation++;
    if (activeXhr) { try { activeXhr.abort(); } catch {} activeXhr = null; }
    isLoading = false;
    failCount = 0;

    document.querySelectorAll(".sa-page-block").forEach(el => el.remove());

    currentPage = detectCurrentPage();
    collectCurrentPage();

    canAutoLoad = false;
    lastTrigger = Date.now();
    resetGuardUntil = Date.now() + CONFIG.RESET_GUARD;
    resetScrollY = window.scrollY;
    pendingBottomCheck = false;
    pendingCheck = false;
    lastY = window.scrollY;

    updatePgUI();

    const myGen = generation;
    setTimeout(() => {
      if (myGen !== generation) return;
      resetGuardUntil = 0;
      if (pendingBottomCheck && autoPage && !isLoading && currentPage < CONFIG.MAX_PAGE) {
        pendingBottomCheck = false;
        canAutoLoad = true;
        tryLoadIfAtBottom();
      }
    }, CONFIG.RESET_GUARD + 50);
  }

  currentPage = detectCurrentPage();
  collectCurrentPage();
  lastY = window.scrollY;
  resetScrollY = window.scrollY;

  const params = new URLSearchParams(location.search);

  const th = isDark
    ? { bg: "#2d2d2d", bg2: "#3a3a3a", bgOn: "#2d4a2d", bd: "#555", tx: "#e0e0e0", tx2: "#b0b0b0" }
    : { bg: "#fff", bg2: "#f5f5f5", bgOn: "#e8f5e8", bd: "#e0e0e0", tx: "#333", tx2: "#666" };

  const style = document.createElement("style");
  style.textContent = `
    #sa-bar { position: fixed; width: 135px; background: ${th.bg}; border: 1px solid ${th.bd}; border-radius: 14px; font-size: 12px; z-index: 99999; box-shadow: 0 6px 16px rgba(0,0,0,.2); font-family: system-ui, sans-serif; overflow: hidden; user-select: none; }
    #sa-header { text-align: center; padding: 11px 0; border-bottom: 1px solid ${th.bd}; cursor: move; }
    .sa-btn { padding: 9px 0; text-align: center; cursor: pointer; border-top: 1px solid ${th.bd}; color: ${th.tx}; transition: background .15s; }
    .sa-btn:hover { background: ${th.bg2}; }
    .sa-btn-active { color: #fff; font-weight: bold; }
    .sa-toggle { padding: 9px; text-align: center; cursor: pointer; border-top: 1px solid ${th.bd}; color: ${th.tx}; }
    .sa-info { padding: 7px; text-align: center; font-size: 10px; color: ${th.tx2}; border-top: 1px solid ${th.bd}; }
    #sa-tip { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); background: rgba(0,0,0,.85); color: #fff; padding: 12px 20px; border-radius: 8px; font-size: 13px; z-index: 100000; pointer-events: none; display: none; transition: opacity .3s; }
    .sa-spin { display: inline-block; width: 10px; height: 10px; border: 2px solid rgba(255,255,255,.3); border-radius: 50%; border-top-color: #fff; animation: sa-spin 0.8s linear infinite; margin-right: 4px; vertical-align: middle; }
    @keyframes sa-spin { to { transform: rotate(360deg); } }
    .sa-page-header { margin: 24px 0; padding: 10px; text-align: center; background: ${th.bg2}; color: ${th.tx}; border-radius: 8px; font-weight: bold; }
    .sa-page-block { list-style: none; }
  `;
  document.head.appendChild(style);

  function toast(msg, ms = 1500) {
    let tip = document.getElementById("sa-tip");
    if (!tip) { tip = document.createElement("div"); tip.id = "sa-tip"; document.body.appendChild(tip); }
    tip.textContent = msg;
    tip.style.display = "block";
    tip.style.opacity = "1";
    clearTimeout(tip.t);
    tip.t = setTimeout(() => { tip.style.opacity = "0"; setTimeout(() => { tip.style.display = "none"; }, 300); }, ms);
  }

  function sanitize(node) {
    node.querySelectorAll("script, iframe, object, embed, form, link, meta").forEach(e => e.remove());
    return node;
  }

  function safeFetch(url) {
    return new Promise((resolve, reject) => {
      if (activeXhr) { try { activeXhr.abort(); } catch {} activeXhr = null; }
      let xhr = null, timer = null, settled = false;

      const finish = (err, val) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (activeXhr?.abort === abortFn) activeXhr = null;
        err ? reject(val) : resolve(val);
      };

      const abortFn = () => { try { xhr?.abort(); } catch {} finish(true, new Error("aborted")); };
      activeXhr = { abort: abortFn };

      const delay = CONFIG.FETCH_DELAY_MIN + Math.random() * (CONFIG.FETCH_DELAY_MAX - CONFIG.FETCH_DELAY_MIN);
      setTimeout(() => {
        if (settled) return;
        xhr = GM_xmlhttpRequest({
          method: "GET",
          url: url,
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "DNT": "1",
            "Referer": new URL(url).origin + "/",
            "User-Agent": navigator.userAgent
          },
          onload: r => { r.status >= 200 && r.status < 300 ? finish(false, r.responseText) : finish(true, new Error("HTTP " + r.status)); },
          onerror: e => finish(true, new Error(e?.error || "network error")),
          ontimeout: () => finish(true, new Error("timeout"))
        });
        activeXhr = xhr;
        timer = setTimeout(abortFn, CONFIG.TIMEOUT);
      }, delay);
    });
  }

  function buildBlock(items, next) {
    const container = resolveContainer();
    if (!container) throw new Error("找不到结果容器");
    const tag = (container.tagName === "OL" || container.tagName === "UL") ? "li" : "div";
    const block = document.createElement(tag);
    block.className = "sa-page-block";
    block.dataset.count = items.length;

    const head = document.createElement("div");
    head.className = "sa-page-header";
    head.textContent = `━━━ 第 ${next} 页 ━━━`;
    block.appendChild(head);

    items.forEach(item => block.appendChild(sanitize(item.cloneNode(true))));
    return { container, block };
  }

  function insertBlock(items, next) {
    let { container, block } = buildBlock(items, next);
    container.appendChild(block);
    if (!block.isConnected) {
      try { block.remove(); } catch {}
      ({ container, block } = buildBlock(items, next));
      container.appendChild(block);
    }
    return { container, block };
  }

  async function loadNext() {
    if (isLoading || !autoPage || !canAutoLoad || currentPage >= CONFIG.MAX_PAGE) return;
    const myGen = generation;
    const next = currentPage + 1;
    isLoading = true;

    const pgEl = document.getElementById("sa-pg");
    if (pgEl) pgEl.innerHTML = `<span class="sa-spin"></span>加载第 ${next} 页`;

    try {
      const u = new URL(location.href);
      u.searchParams.set(engine.pageParam, ((next - 1) * engine.pageStep + engine.pageBase).toString());

      const html = await safeFetch(u.toString());
      if (myGen !== generation) return;

      if (engine.name === "Google") {
        const looksLikeLogin = /accounts\.google\.com|ServiceLogin/i.test(html);
        const hasResults = /class="[^"]*\bMjjYud\b/.test(html) || /class="[^"]*\bg\b[^"]*"[^>]*>\s*<a[^>]*href="http/i.test(html);
        if (looksLikeLogin && !hasResults) throw new Error("Google 要求登录");
      }

      const doc = new DOMParser().parseFromString(html, "text/html");
      const rawItems = engine.getResults(doc);
      if (!rawItems.length) throw new Error("无结果");

      const newItems = rawItems.filter(el => {
        const h = getHref(el);
        if (!h || seenHrefs.has(h)) return false;
        seenHrefs.add(h);
        return true;
      });
      if (!newItems.length) throw new Error("结果全部重复");

      insertBlock(newItems, next);

      totalCount += newItems.length;
      const container = resolveContainer();
      if (container) {
        while (totalCount > CONFIG.MAX_DOM_RESULTS) {
          const blocks = container.querySelectorAll(".sa-page-block");
          if (blocks.length > 1) {
            totalCount = Math.max(0, totalCount - parseInt(blocks[0].dataset.count || 0));
            blocks[0].remove();
          } else break;
        }
      }

      currentPage = next;
      failCount = 0;
      lastTrigger = Date.now() + CONFIG.TRIGGER_COOLDOWN;
      updatePgUI();
    } catch (e) {
      if (myGen !== generation) return;
      if (e.message !== "aborted") {
        if (e.message.includes("登录")) {
          toast("⚠️ Google 需要登录才能翻页，已暂停自动翻页", 3500);
          autoPage = false;
          storage.set("sa_auto_v2.1", autoPage);
          toggleUpdate();
        } else {
          failCount++;
          if (failCount >= CONFIG.FAIL_LIMIT) {
            toast(`⚠️ ${engine.name} 响应受限，已暂停自动翻页`, 3500);
            autoPage = false;
            storage.set("sa_auto_v2.1", autoPage);
            toggleUpdate();
          } else {
            toast(`❌ 翻页失败: ${e.message}`);
          }
        }
      }
    } finally {
      if (myGen === generation) {
        isLoading = false;
        if (pgEl && pgEl.textContent.includes("加载")) updatePgUI();
        if (pendingCheck) {
          pendingCheck = false;
          setTimeout(tryLoadIfAtBottom, 200);
        }
      }
    }
  }

  function tryLoadIfAtBottom() {
    if (!autoPage || !engine.auto) return;
    if (isLoading) { pendingCheck = true; return; }
    if (currentPage >= CONFIG.MAX_PAGE) return;
    if (!canAutoLoad) return;
    if (Date.now() < resetGuardUntil) return;
    if (!isNearBottom()) return;
    const now = Date.now();
    if (now - lastTrigger < CONFIG.TRIGGER_COOLDOWN) return;
    lastTrigger = now;
    loadNext();
  }

  const bar = document.createElement("div");
  bar.id = "sa-bar";
  const savedPos = storage.get("sa_pos_v2.1", null);
  if (savedPos) {
    bar.style.left = `${Math.round(savedPos.x)}px`;
    bar.style.top = `${Math.round(savedPos.y)}px`;
  } else {
    bar.style.left = "10px";
    bar.style.top = `${Math.round(window.innerHeight / 2)}px`;
    bar.style.transform = "translateY(-50%)";
  }

  const header = document.createElement("div");
  header.id = "sa-header";
  header.innerHTML = `<div style="font-size:14px;font-weight:bold;color:${th.tx}">${engine.icon} 聚合搜索</div><div style="font-size:10px;color:${th.tx2}">by jbaoyin</div>`;
  bar.appendChild(header);

  const q = params.get("q") || "";
  const icons = { Google: "🔍 Google", Bing: "🅱️ Bing", DDG: "🦆 DDG" };

  ENGINES.forEach(eng => {
    const btn = document.createElement("div");
    btn.className = `sa-btn ${eng.name === engine.name ? "sa-btn-active" : ""}`;
    btn.textContent = icons[eng.name];
    if (eng.name === engine.name) btn.style.background = eng.color;
    else btn.onclick = () => {
      if (!q) return toast("未检测到有效搜索词");
      toast("跳转中...");
      const target = new URL(eng.url);
      params.forEach((v, k) => target.searchParams.set(k, v));
      target.searchParams.set("q", q);
      setTimeout(() => location.href = target.toString(), 200);
    };
    bar.appendChild(btn);
  });

  if (engine.auto) {
    const toggle = document.createElement("div");
    toggle.className = "sa-toggle";
    toggleUpdate = () => {
      toggle.textContent = `🔄 翻页: ${autoPage ? "ON" : "OFF"}`;
      toggle.style.background = autoPage ? th.bgOn : th.bg2;
    };
    toggleUpdate();
    toggle.onclick = () => { autoPage = !autoPage; storage.set("sa_auto_v2.1", autoPage); toggleUpdate(); };
    bar.appendChild(toggle);
  }

  const pgInfo = document.createElement("div");
  pgInfo.id = "sa-pg";
  pgInfo.className = "sa-info";
  pgInfo.textContent = `📄 第 ${currentPage} 页`;
  bar.appendChild(pgInfo);

  let drag = false, sx, sy, ol, ot;
  header.onmousedown = e => {
    drag = true; sx = e.clientX; sy = e.clientY;
    const r = bar.getBoundingClientRect(); ol = r.left; ot = r.top;
    bar.style.transform = "none"; e.preventDefault();
  };
  document.addEventListener("mousemove", e => {
    if (!drag) return;
    bar.style.left = `${Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, ol + e.clientX - sx))}px`;
    bar.style.top = `${Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, ot + e.clientY - sy))}px`;
  });
  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = false;
    storage.set("sa_pos_v2.1", { x: parseInt(bar.style.left), y: parseInt(bar.style.top) });
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") bar.style.display = bar.style.display === "none" ? "block" : "none";
  });
  window.addEventListener("resize", () => {
    bar.style.left = `${Math.min(parseInt(bar.style.left) || 0, window.innerWidth - bar.offsetWidth)}px`;
    bar.style.top = `${Math.min(parseInt(bar.style.top) || 0, window.innerHeight - bar.offsetHeight)}px`;
  });

  document.body.appendChild(bar);

  const topBtn = document.createElement("div");
  topBtn.style.cssText = "position:fixed;bottom:80px;right:30px;width:44px;height:44px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:50%;text-align:center;line-height:44px;font-size:20px;cursor:pointer;display:none;z-index:99998;box-shadow:0 4px 12px rgba(0,0,0,.2);";
  topBtn.textContent = "⬆";
  topBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  document.body.appendChild(topBtn);
  window.addEventListener("scroll", () => { topBtn.style.display = window.scrollY > 300 ? "block" : "none"; }, { passive: true });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(resetState, CONFIG.RESET_DELAY);
    }
  }, CONFIG.URL_CHECK_INTERVAL);

  if (engine.auto) {
    let scrollDebounceTimer = null;

    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      const delta = Math.abs(y - lastY);
      if (delta < 1) return;
      lastY = y;

      if (Date.now() < resetGuardUntil) {
        if (isNearBottom()) pendingBottomCheck = true;
        return;
      }

      if (!canAutoLoad && Math.abs(y - resetScrollY) >= CONFIG.SCROLL_AFTER_RESET) {
        canAutoLoad = true;
      }

      clearTimeout(scrollDebounceTimer);
      scrollDebounceTimer = setTimeout(tryLoadIfAtBottom, CONFIG.SCROLL_DEBOUNCE);
    }, { passive: true });

    setInterval(tryLoadIfAtBottom, CONFIG.PERIODIC_CHECK);
    setTimeout(tryLoadIfAtBottom, 1200);
  }

  window.addEventListener("beforeunload", () => { try { activeXhr?.abort(); } catch {} });
})();

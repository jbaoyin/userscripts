// ==UserScript==
// @name         🔍 聚合搜索
// @description  DDG/Google/Bing 悬浮工具栏：支持引擎切换、自动翻页、深色模式、一键回顶、拖拽记忆与 ESC 快捷隐藏。
// @version      2.0.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        *://duckduckgo.com/*
// @match        *://*.google.com*/search*
// @match        *://*.bing.com/search*
// @grant        GM_xmlhttpRequest
// @connect      duckduckgo.com
// @connect      google.com
// @connect      google.com.hk
// @connect      google.co.jp
// @connect      bing.com
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// ==/UserScript==

!(function () {
  "use strict";

  const CONFIG = { MAX_PAGE: 25, MAX_DOM_RESULTS: 150, TIMEOUT: 8000, FAIL_LIMIT: 2 };
  
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
      getContainer: doc => doc.querySelector(".MjjYud")?.parentElement || doc.querySelector(".g")?.parentElement
    },
    {
      name: "Bing", url: "https://www.bing.com/search", test: /bing\.com.*\/search/,
      pageParam: "first", pageStep: 10, pageBase: 1, auto: true, icon: "🅱️", color: "#008080",
      getResults: doc => Array.from(doc.querySelectorAll("#b_results .b_algo, li.b_algo, .b_ans")),
      getContainer: doc => doc.querySelector("#b_results")
    }
  ];

  const engine = ENGINES.find(e => e.test.test(location.href));
  if (!engine) return;

  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let autoPage = storage.get("sa_auto_v2.0", true);
  let isLoading = false, failCount = 0, activeXhr = null;
  let totalCount = engine.getResults(document).length;
  let sentinel = null;

  const params = new URLSearchParams(location.search);
  let currentPage = Math.max(1, Math.floor(((parseInt(params.get(engine.pageParam)) || 0) - engine.pageBase) / engine.pageStep) + 1);

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
  `;
  document.head.appendChild(style);

  function toast(msg) {
    let tip = document.getElementById("sa-tip") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "sa-tip" }));
    tip.textContent = msg;
    tip.style.display = "block";
    tip.style.opacity = "1";
    clearTimeout(tip.t);
    tip.t = setTimeout(() => { tip.style.opacity = "0"; setTimeout(() => tip.style.display = "none", 300); }, 1500);
  }

  function sanitize(node) {
    node.querySelectorAll("script, iframe, object, embed, form, link, meta").forEach(e => e.remove());
    return node;
  }

  function safeFetch(url) {
    return new Promise((resolve, reject) => {
      if (activeXhr) { activeXhr.abort(); activeXhr = null; }
      let xhr = null, timer = null, settled = false;

      const finish = (err, val) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (activeXhr?.abort === abortFn) activeXhr = null;
        err ? reject(val) : resolve(val);
      };

      const abortFn = () => { xhr?.abort(); finish(true, new Error("aborted")); };
      activeXhr = { abort: abortFn };

      setTimeout(() => {
        if (settled) return;
        xhr = GM_xmlhttpRequest({
          method: "GET",
          url: url,
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": new URL(url).origin + "/",
            "User-Agent": navigator.userAgent
          },
          onload: r => { r.status >= 200 && r.status < 300 ? finish(false, r.responseText) : finish(true, new Error("HTTP " + r.status)); },
          onerror: e => finish(true, e)
        });
        activeXhr = xhr;
        timer = setTimeout(abortFn, CONFIG.TIMEOUT);
      }, 300 + Math.random() * 300);
    });
  }

  async function loadNext() {
    const next = currentPage + 1;
    if (isLoading || !autoPage || next > CONFIG.MAX_PAGE) return;
    isLoading = true;

    const pgEl = document.getElementById("sa-pg");
    if (pgEl) pgEl.innerHTML = `<span class="sa-spin"></span>加载第 ${next} 页`;

    try {
      const u = new URL(location.href);
      u.searchParams.set(engine.pageParam, ((next - 1) * engine.pageStep + engine.pageBase).toString());

      const html = await safeFetch(u.toString());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newItems = engine.getResults(doc);
      if (!newItems.length) throw new Error("Empty");

      const container = engine.getContainer(document);
      if (!container) throw new Error("No container");

      const block = document.createElement("div");
      block.className = "sa-page-block";
      block.dataset.count = newItems.length;
      block.innerHTML = `<div style="margin:24px 0;padding:10px;text-align:center;background:${th.bg2};color:${th.tx};border-radius:8px;font-weight:bold;">━━━ 第 ${next} 页 ━━━</div>`;
      
      newItems.forEach(item => block.appendChild(sanitize(item.cloneNode(true))));

      if (sentinel && sentinel.parentElement === container) container.insertBefore(block, sentinel);
      else container.appendChild(block);

      totalCount += newItems.length;
      while (totalCount > CONFIG.MAX_DOM_RESULTS) {
        const blocks = container.querySelectorAll(".sa-page-block");
        if (blocks.length) {
          totalCount = Math.max(0, totalCount - parseInt(blocks[0].dataset.count || 0));
          blocks[0].remove();
        } else break;
      }

      currentPage = next;
      failCount = 0;
      if (pgEl) pgEl.textContent = `📄 第 ${currentPage} 页`;
    } catch (e) {
      if (e.message !== "aborted") {
        toast("❌ 翻页失败");
        if (++failCount >= CONFIG.FAIL_LIMIT) toast(`⚠️ ${engine.name} 响应受限`, 3000);
      }
    } finally {
      isLoading = false;
      if (pgEl && pgEl.textContent.includes("加载")) pgEl.textContent = `📄 第 ${currentPage} 页`;
    }
  }

  const bar = document.createElement("div");
  bar.id = "sa-bar";
  const pos = storage.get("sa_pos_v2.0", null) || { x: 10, y: window.innerHeight / 2 };
  bar.style.left = `${pos.x}px`;
  bar.style.top = `${pos.y}px`;
  if (!storage.get("sa_pos_v2.0", null)) bar.style.transform = "translateY(-50%)";

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

  let toggle = null;
  if (engine.auto) {
    toggle = document.createElement("div");
    toggle.className = "sa-toggle";
    const updateT = () => { toggle.textContent = `🔄 翻页: ${autoPage ? "ON" : "OFF"}`; toggle.style.background = autoPage ? th.bgOn : th.bg2; };
    updateT();
    toggle.onclick = () => { autoPage = !autoPage; storage.set("sa_auto_v2.0", autoPage); updateT(); };
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
    drag = false; storage.set("sa_pos_v2.0", { x: parseInt(bar.style.left), y: parseInt(bar.style.top) });
  });

  window.addEventListener("keydown", e => { if (e.key === "Escape") bar.style.display = bar.style.display === "none" ? "block" : "none"; });
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

  const container = engine.getContainer(document);
  if (container) {
    sentinel = document.createElement("div");
    sentinel.style.cssText = "width:100%;height:1px;visibility:hidden;pointer-events:none;";
    container.appendChild(sentinel);

    let last = 0;
    new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && autoPage && engine.auto && !isLoading && currentPage < CONFIG.MAX_PAGE) {
          const now = Date.now();
          if (now - last > 1200) { last = now; loadNext(); }
        }
      });
    }, { rootMargin: "400px" }).observe(sentinel);
  }

  window.addEventListener("beforeunload", () => activeXhr?.abort());
})();

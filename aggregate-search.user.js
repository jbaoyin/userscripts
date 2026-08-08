// ==UserScript==
// @name         🔍 聚合搜索
// @description  Brave/DDG/Google 悬浮工具栏：支持引擎切换、自动翻页、深色模式、一键回顶。
// @version      1.3.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        *://duckduckgo.com/*
// @match        *://www.google.com.hk/search*
// @match        *://www.google.com/search*
// @match        *://search.brave.com/search*
// @grant        none
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/aggregate-search.user.js
// ==/UserScript==

!(function () {
  "use strict";

  const ENGINES = [
    {
      name: "Brave",
      url: "https://search.brave.com/search?q=",
      param: "q",
      test: /search\.brave\.com/,
      pageParam: "offset",
      pageStep: 1,
      pageBase: -1,
      auto: !0,
      icon: "🦁",
      color: "#4CAF50",
    },
    {
      name: "DDG",
      url: "https://duckduckgo.com/?q=",
      param: "q",
      test: /duckduckgo\.com/,
      pageParam: "s",
      pageStep: 50,
      pageBase: 0,
      auto: !1,
      icon: "🦆",
      color: "#FF9800",
    },
    {
      name: "Google",
      url: "https://www.google.com/search?q=",
      param: "q",
      test: /google\.com/,
      pageParam: "start",
      pageStep: 10,
      pageBase: 0,
      auto: !0,
      icon: "🔍",
      color: "#2196F3",
    },
  ];
  const RESULT_SELECTORS = ["#results", ".results", "#search"];
  const STORAGE_KEY_POS = "sa_pos";
  const STORAGE_KEY_AUTO = "sa_auto";
  const FETCH_TIMEOUT = 8000;
  const MAX_FAIL_COUNT = 2;

  const currentEngine = ENGINES.find((e) => e.test.test(location.href));
  if (!currentEngine) return;

  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let autoPageEnabled = "false" !== localStorage.getItem(STORAGE_KEY_AUTO);
  let currentPage = 1;
  let isLoading = false;
  let failCount = 0;
  let cleanupFns = [];

  const theme = isDark
    ? {
        bg: "#2d2d2d",
        bg2: "#3a3a3a",
        bgOn: "#2d4a2d",
        bd: "#555",
        tx: "#e0e0e0",
        tx2: "#b0b0b0",
        hv: "#3a3a3a",
        sh: "rgba(0,0,0,.3)",
      }
    : {
        bg: "#fff",
        bg2: "#f5f5f5",
        bgOn: "#e8f5e8",
        bd: "#e0e0e0",
        tx: "#333",
        tx2: "#666",
        hv: "#f9f9f9",
        sh: "rgba(0,0,0,.1)",
      };

  function getResultsContainer(doc = document) {
    for (const sel of RESULT_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function showToast(msg, duration = 1500) {
    let tip = document.getElementById("sa-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "sa-tip";
      tip.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);color:#fff;padding:14px 24px;border-radius:10px;font-size:14px;z-index:100000;pointer-events:none;display:none;transition:opacity .3s";
      document.body.appendChild(tip);
    }
    tip.textContent = msg;
    tip.style.display = "block";
    tip.style.opacity = "1";
    clearTimeout(tip._timer);
    tip._timer = setTimeout(() => {
      tip.style.opacity = "0";
      setTimeout(() => (tip.style.display = "none"), 300);
    }, duration);
  }

  async function safeFetch(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const randomDelay = 1500 + Math.random() * 1500;
    await new Promise((r) => setTimeout(r, randomDelay));
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/html" },
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  function sanitizeNodes(container) {
    const dangerous = container.querySelectorAll(
      "script, iframe, object, embed, form",
    );
    dangerous.forEach((el) => el.remove());
    return container;
  }

  function updateStatusIndicator(bar) {
    let indicator = bar.querySelector("#sa-status");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "sa-status";
      indicator.style.cssText = `height:3px;width:100%;border-radius:12px 12px 0 0;transition:background .3s`;
      bar.insertBefore(indicator, bar.firstChild);
    }
    indicator.style.background = `linear-gradient(90deg, ${currentEngine.color}, ${currentEngine.color}88)`;
    const titleEl = bar.querySelector("#sa-title");
    if (titleEl)
      titleEl.innerHTML = `<span style="margin-right:4px">${currentEngine.icon}</span>聚合搜索`;
  }

  function highlightFallback(bar) {
    const btns = bar.querySelectorAll("[data-engine]");
    btns.forEach((btn) => {
      if (
        failCount >= MAX_FAIL_COUNT &&
        btn.dataset.engine !== currentEngine.name
      ) {
        btn.style.animation = "sa-pulse 1.5s infinite";
      } else {
        btn.style.animation = "";
      }
    });
  }

  function initBackToTop() {
    const btn = document.createElement("div");
    btn.style.cssText =
      "position:fixed;bottom:80px;right:30px;width:48px;height:48px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:50%;text-align:center;line-height:48px;font-size:22px;cursor:pointer;display:none;z-index:99998;box-shadow:0 4px 12px rgba(102,126,234,.4);transition:transform .2s";
    btn.textContent = "⬆";
    btn.onmouseover = () =>
      (btn.style.transform = "translateY(-4px) scale(1.1)");
    btn.onmouseout = () => (btn.style.transform = "");
    btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(btn);

    const onScroll = (() => {
      let lastTime = 0,
        timer = null;
      const run = () => {
        lastTime = Date.now();
        timer = null;
        const scrollY = window.scrollY;
        const winH = window.innerHeight;
        const docH = document.documentElement.scrollHeight;
        btn.style.display = scrollY > 300 ? "block" : "none";
        if (
          scrollY >= 100 &&
          autoPageEnabled &&
          currentEngine.auto &&
          !isLoading &&
          currentPage < 10 &&
          scrollY + winH >= docH - 300
        ) {
          loadNextPage();
        }
      };
      return () => {
        const now = Date.now();
        const remaining = 300 - (now - lastTime);
        if (remaining <= 0) {
          clearTimeout(timer);
          timer = null;
          run();
        } else if (!timer) {
          timer = setTimeout(run, remaining);
        }
      };
    })();

    window.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      if (window.scrollY >= 100) onScroll();
    });
    ro.observe(document.documentElement);
    cleanupFns.push(() => {
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
    });
  }

  async function loadNextPage() {
    if (isLoading || currentPage >= 10) return;
    isLoading = true;
    currentPage++;
    showToast(`⏳ 正在加载第 ${currentPage} 页...`);
    try {
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.set(
        currentEngine.pageParam,
        (
          currentPage * currentEngine.pageStep +
          (currentEngine.pageBase || 0)
        ).toString(),
      );
      const html = await safeFetch(nextUrl.toString());
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const newResults = getResultsContainer(doc);
      const curResults = getResultsContainer();
      if (newResults && curResults) {
        const sanitized = sanitizeNodes(newResults);
        const divider = document.createElement("div");
        divider.textContent = `━━━ 第 ${currentPage} 页 ━━━`;
        divider.style.cssText = `margin:28px 0;padding:11px;text-align:center;background:${theme.bg2};color:${theme.tx};border-radius:8px;font-weight:bold`;
        curResults.appendChild(divider);
        Array.from(sanitized.children).forEach((child) => {
          if (!child.classList.contains("page")) curResults.appendChild(child);
        });
      }
      const pgEl = document.getElementById("sa-pg");
      if (pgEl) pgEl.textContent = `📄 第 ${currentPage} 页`;
      failCount = 0;
      highlightFallback(document.getElementById("sa-bar"));
    } catch {
      showToast("❌ 翻页失败");
      currentPage--;
      failCount++;
      if (failCount >= MAX_FAIL_COUNT) {
        showToast(`⚠️ ${currentEngine.name} 连续受限，建议切换引擎`, 3000);
        highlightFallback(document.getElementById("sa-bar"));
      }
    } finally {
      isLoading = false;
    }
  }

  function initBar() {
    const bar = document.createElement("div");
    bar.id = "sa-bar";
    const savedPos = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_POS));
      } catch {
        return null;
      }
    })();
    bar.style.cssText = `position:fixed;${savedPos ? `left:${savedPos.x}px;top:${savedPos.y}px` : "left:10px;top:50%;transform:translateY(-50%)"};width:118px;background:${theme.bg};border:1px solid ${theme.bd};border-radius:12px;font-size:12px;z-index:99999;box-shadow:0 6px 16px ${theme.sh};font-family:system-ui,Arial,sans-serif;overflow:hidden`;

    const header = document.createElement("div");
    header.id = "sa-header";
    header.style.cssText = `text-align:center;padding:11px 0;border-bottom:1px solid ${theme.bd};cursor:move`;
    header.innerHTML = `<div id="sa-title" style="font-size:14px;font-weight:bold;color:${theme.tx}"><span style="margin-right:4px">${currentEngine.icon}</span>聚合搜索</div><div style="font-size:10px;color:${theme.tx2}">by jbaoyin</div>`;
    bar.appendChild(header);

    ENGINES.forEach((eng) => {
      const btn = document.createElement("div");
      btn.dataset.engine = eng.name;
      btn.textContent = eng.name;
      const isActive = eng.name === currentEngine.name;
      btn.style.cssText = `padding:9px 0;text-align:center;cursor:pointer;border-top:1px solid ${theme.bd};color:${isActive ? "#fff" : theme.tx};background:${isActive ? eng.color : ""};font-weight:${isActive ? "bold" : "normal"};transition:background .15s`;
      if (!isActive) {
        btn.onmouseover = () => (btn.style.background = theme.hv);
        btn.onmouseout = () => (btn.style.background = "");
        btn.onclick = () => {
          const q =
            new URLSearchParams(location.search).get(currentEngine.param) || "";
          if (q) {
            showToast("跳转中...");
            failCount = 0;
            setTimeout(
              () => (location.href = eng.url + encodeURIComponent(q)),
              250,
            );
          }
        };
      }
      bar.appendChild(btn);
    });

    if (currentEngine.auto) {
      const toggleBtn = document.createElement("div");
      const updateToggle = () => {
        toggleBtn.innerHTML = `🔄 翻页: <b>${autoPageEnabled ? "ON" : "OFF"}</b>`;
        toggleBtn.style.background = autoPageEnabled ? theme.bgOn : theme.bg2;
      };
      toggleBtn.style.cssText = `padding:9px;text-align:center;cursor:pointer;border-top:1px solid ${theme.bd};color:${theme.tx};user-select:none`;
      updateToggle();
      toggleBtn.onclick = () => {
        autoPageEnabled = !autoPageEnabled;
        localStorage.setItem(STORAGE_KEY_AUTO, autoPageEnabled);
        updateToggle();
      };
      bar.appendChild(toggleBtn);
    }

    const pgInfo = document.createElement("div");
    pgInfo.id = "sa-pg";
    pgInfo.style.cssText = `padding:7px;text-align:center;font-size:10px;color:${theme.tx2};border-top:1px solid ${theme.bd}`;
    pgInfo.textContent = "📄 第 1 页";
    bar.appendChild(pgInfo);

    updateStatusIndicator(bar);

    // 拖拽逻辑
    let isDragging = false,
      startX,
      startY,
      origLeft,
      origTop;
    header.onmousedown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = bar.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      bar.style.transform = "none";
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      bar.style.left = origLeft + e.clientX - startX + "px";
      bar.style.top = origTop + e.clientY - startY + "px";
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      try {
        localStorage.setItem(
          STORAGE_KEY_POS,
          JSON.stringify({
            x: parseInt(bar.style.left),
            y: parseInt(bar.style.top),
          }),
        );
      } catch {}
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    cleanupFns.push(() => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    });

    document.body.appendChild(bar);
  }

  // 全局样式注入（含脉冲动画）
  const style = document.createElement("style");
  style.textContent = `
    #sa-bar:hover{box-shadow:0 8px 24px ${theme.sh}!important}
    @keyframes sa-pulse{0%,100%{opacity:1}50%{opacity:.5}}
  `;
  document.head.appendChild(style);

  // 深色模式切换重载
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => location.reload());

  // 页面卸载时清理
  window.addEventListener("beforeunload", () =>
    cleanupFns.forEach((fn) => fn()),
  );

  // 初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initBar();
      initBackToTop();
    });
  } else {
    setTimeout(() => {
      initBar();
      initBackToTop();
    }, 100);
  }
})();

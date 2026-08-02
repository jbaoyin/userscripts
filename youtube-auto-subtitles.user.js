// ==UserScript==
// @name         📺 YouTube自动字幕
// @description  自动开启YouTube中文字幕
// @version      1.2.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// ==/UserScript==

!(function () {
  "use strict";

  const LANG_KEYWORDS = ["中文(简体)", "中文（简体）", "简体中文", "chinese(simplified)", "zh-hans"];
  let fingerprint = GM_getValue("imtFingerprint", "immersive-translate");

  GM_registerMenuCommand("✏️ 设置沉浸式翻译特征字符串", () => {
    const input = prompt("输入沉浸式翻译的class/id特征字符串：", fingerprint);
    if (input !== null && input.trim()) {
      fingerprint = input.trim();
      GM_setValue("imtFingerprint", fingerprint);
      alert("已保存，刷新页面后生效");
    }
  });

  // ---------- Toast提示 ----------
  function showToast(text, duration = 3000) {
    const toast = document.createElement("div");
    toast.textContent = text;
    toast.style.cssText =
      "position:fixed;top:70px;right:20px;background:rgba(0,0,0,.85);color:#fff;" +
      "padding:10px 16px;border-radius:8px;font-size:13px;z-index:100000;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ---------- 工具函数 ----------
  const norm = (s) => s.replace(/[\s\u00A0\u200B]/g, "").replace(/（/g, "(").replace(/）/g, ")").toLowerCase();
  const findItem = (keys) => {
    const items = document.querySelectorAll(".ytp-menuitem");
    return Array.from(items).find((e) => {
      const t = norm(e.textContent);
      return keys.some((k) => t.includes(norm(k)));
    });
  };

  // 条件轮询：等待元素出现或超时
  function waitFor(selectorOrFn, timeout = 3000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const el = typeof selectorOrFn === "function" ? selectorOrFn() : document.querySelector(selectorOrFn);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // ---------- 核心逻辑 ----------
  const hasImmersiveTranslate = () =>
    !!document.querySelector(`[class*="${fingerprint}" i], [id*="${fingerprint}" i]`);

  const clickCC = async () => {
    const btn = document.querySelector(".ytp-subtitles-button");
    if (btn && btn.getAttribute("aria-pressed") === "false") btn.click();
  };

  const selectLanguage = async () => {
    const settingsBtn = document.querySelector(".ytp-settings-button");
    if (!settingsBtn) return false;

    settingsBtn.click();
    const subtitleItem = await waitFor(() => findItem(["字幕", "subtitles", "cc"]));
    if (!subtitleItem) { settingsBtn.click(); return false; }
    subtitleItem.click();

    // 优先查找原生简中
    const direct = await waitFor(() => findItem(LANG_KEYWORDS), 2000);
    if (direct) {
      direct.click();
      showToast("✅ 已开启：中文(简体) [原生]");
      return true;
    }

    // 尝试自动翻译路径
    const autoTranslate = await waitFor(() => findItem(["自动翻译", "auto-translate"]), 2000);
    if (!autoTranslate) { settingsBtn.click(); return false; }
    autoTranslate.click();

    const translated = await waitFor(() => findItem(LANG_KEYWORDS), 3000);
    if (translated) {
      translated.click();
      showToast("✅ 已开启：中文(简体) [自动翻译]");
      return true;
    }

    // 翻译路径也失败，保留CC开启状态
    settingsBtn.click();
    showToast("⚠️ 未找到中文简体，已保留原始字幕");
    return false;
  };

  // 视频ID提取与缓存
  const getVideoId = () => new URLSearchParams(location.search).get("v");
  const processedVideos = new Set();

  const tryEnable = async () => {
    if (!document.querySelector(".html5-video-player")) return;
    const vid = getVideoId();
    if (vid && processedVideos.has(vid)) return;

    await new Promise((r) => setTimeout(r, 800)); // 等待播放器初始化

    if (hasImmersiveTranslate()) {
      showToast("ℹ️ 检测到沉浸式翻译，跳过原生字幕选择");
      if (vid) processedVideos.add(vid);
      return;
    }

    await clickCC();
    const success = await selectLanguage();
    if (vid && success) processedVideos.add(vid);
  };

  // ---------- 事件监听 ----------
  window.addEventListener("load", tryEnable);

  // 优先使用YouTube内部导航事件，回退到MutationObserver
  let lastUrl = location.href;
  const onNavigate = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryEnable, 1000);
    }
  };

  if ("onYTNavigateFinish" in window || document.addEventListener) {
    document.addEventListener("yt-navigate-finish", onNavigate);
  }
  new MutationObserver(onNavigate).observe(document, { subtree: true, childList: true });
})();

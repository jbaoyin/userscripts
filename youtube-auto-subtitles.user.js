// ==UserScript==
// @name         📺 YouTube自动字幕
// @description  自动开启YouTube中文字幕
// @version      1.1.1
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

  const LANG_KEYWORDS = ["中文(简体)", "中文（简体）", "简体中文", "Chinese (Simplified)"];
  let fingerprint = GM_getValue("imtFingerprint", "immersive-translate");

  GM_registerMenuCommand("✏️ 设置沉浸式翻译特征字符串（检测失效时用）", () => {
    const input = prompt(
      "输入沉浸式翻译的class/id特征字符串（F12检查页面元素获取）：",
      fingerprint
    );
    if (input !== null && input.trim()) {
      fingerprint = input.trim();
      GM_setValue("imtFingerprint", fingerprint);
      alert("已保存，刷新YouTube页面后生效");
    }
  });

  // ---------- Toast提示（增加防重复） ----------
  let toastTimer = null;
  function showToast(text, duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    const existing = document.querySelector(".yt-auto-sub-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "yt-auto-sub-toast";
    toast.textContent = text;
    toast.style.cssText =
      "position:fixed;top:70px;right:20px;background:rgba(0,0,0,.85);color:#fff;" +
      "padding:10px 16px;border-radius:8px;font-size:13px;z-index:100000;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s";
    document.body.appendChild(toast);

    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
      toastTimer = null;
    }, duration);
  }

  // ---------- 核心逻辑（完全保留v1.1.0时序与交互） ----------
  const norm = (e) => e.replace(/\s/g, "").replace(/（/g, "(").replace(/）/g, ")");
  const findItem = (keys) => {
    const items = document.querySelectorAll(".ytp-menuitem");
    return Array.from(items).find((e) => {
      const t = norm(e.textContent);
      return keys.some((k) => t.includes(norm(k)));
    });
  };

  const clickCC = () => {
    const e = document.querySelector(".ytp-subtitles-button");
    e && "false" === e.getAttribute("aria-pressed") && e.click();
  };

  const hasImmersiveTranslate = () =>
    !!document.querySelector(`[class*="${fingerprint}" i], [id*="${fingerprint}" i]`);

  const selectLanguage = () => {
    const settingsBtn = document.querySelector(".ytp-settings-button");
    if (!settingsBtn) return;
    const close = () => settingsBtn.click();

    settingsBtn.click();
    setTimeout(() => {
      const subtitleItem = findItem(["字幕", "Subtitles", "CC"]);
      if (!subtitleItem) return close();
      subtitleItem.click();

      setTimeout(() => {
        const direct = findItem(LANG_KEYWORDS);
        if (direct) return direct.click();

        const autoTranslate = findItem(["自动翻译", "Auto-translate"]);
        if (!autoTranslate) return close();
        autoTranslate.click();

        setTimeout(() => {
          const translated = findItem(LANG_KEYWORDS);
          translated ? translated.click() : close();
        }, 400);
      }, 400);
    }, 300);
  };

  // ---------- 执行入口（增加视频ID去重 + yt-navigate-finish监听） ----------
  const processedVideos = new Set();
  const getVideoId = () => new URLSearchParams(location.search).get("v");

  const tryEnable = () => {
    if (!document.querySelector(".html5-video-player")) return;
    const vid = getVideoId();
    if (vid && processedVideos.has(vid)) return;

    setTimeout(() => {
      clickCC();
      setTimeout(() => {
        if (hasImmersiveTranslate()) {
          showToast("检测到沉浸式翻译已启用，默认不选择自动翻译");
        } else {
          selectLanguage();
        }
        if (vid) processedVideos.add(vid);
      }, 800);
    }, 1000);
  };

  window.addEventListener("load", tryEnable);

  // 兼容YouTube SPA导航
  let lastUrl = location.href;
  const onNavigate = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryEnable, 1500);
    }
  };

  document.addEventListener("yt-navigate-finish", onNavigate);
  new MutationObserver(onNavigate).observe(document, { subtree: true, childList: true });
})();

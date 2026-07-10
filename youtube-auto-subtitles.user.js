// ==UserScript==
// @name         📺 YouTube自动字幕
// @description  自动开启YouTube中文字幕
// @version      1.1.0
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

  // 字幕语言固定为中文，不做自定义
  const LANG_KEYWORDS = ["中文(简体)", "中文（简体）", "简体中文", "Chinese (Simplified)"];

  // 沉浸式翻译的检测特征字符串。如果以后插件改了命名规则导致检测失效，
  // 用F12在页面元素里找到它新的class/id特征词，通过下面的菜单命令改这个值即可，不用改源码。
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

  // ---------- 页面内提示 ----------
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

  // ---------- 核心逻辑 ----------
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

  const tryEnable = () => {
    if (!document.querySelector(".html5-video-player")) return;
    setTimeout(() => {
      clickCC();
      setTimeout(() => {
        if (hasImmersiveTranslate()) {
          showToast("检测到沉浸式翻译已启用，默认不选择自动翻译");
        } else {
          selectLanguage();
        }
      }, 800);
    }, 1000);
  };

  window.addEventListener("load", tryEnable);
  let lastUrl = location.href;
  new MutationObserver(() => {
    location.href !== lastUrl &&
      ((lastUrl = location.href), setTimeout(tryEnable, 1500));
  }).observe(document, { subtree: true, childList: true });
})();

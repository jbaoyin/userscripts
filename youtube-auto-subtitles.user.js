// ==UserScript==
// @name         📺 YouTube自动字幕
// @description  自动开启YouTube中文字幕
// @version      1.0.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        none
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// ==/UserScript==

!(function () {
  "use strict";
  const LANG_KEYWORDS = ["中文(简体)", "中文（简体）", "简体中文", "Chinese (Simplified)"];
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
    document.querySelector(".html5-video-player") &&
      setTimeout(() => {
        clickCC();
        selectLanguage();
      }, 1000);
  };

  window.addEventListener("load", tryEnable);
  let lastUrl = location.href;
  new MutationObserver(() => {
    location.href !== lastUrl &&
      ((lastUrl = location.href), setTimeout(tryEnable, 1500));
  }).observe(document, { subtree: true, childList: true });
})();

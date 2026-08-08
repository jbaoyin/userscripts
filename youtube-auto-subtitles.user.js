// ==UserScript==
// @name         📺 YouTube自动中文字幕
// @namespace    https://github.com/jbaoyin/userscripts
// @version      2.0.0
// @description  自动开启YouTube中文字幕，无中文字幕时自动选择翻译中文；检测沉浸式翻译后自动停用
// @author       jbaoyin
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    chinese: ["中文(简体)", "中文（简体）", "简体中文", "Chinese (Simplified)"],
    translate: ["自动翻译", "Auto-translate", "Auto translate"],
    subtitle: ["字幕", "Subtitles", "Captions"],
  };

  let fingerprint = GM_getValue("immersiveFingerprint", "immersive");

  GM_registerMenuCommand("⚙️ 设置沉浸式翻译检测字符串", () => {
    const v = prompt("请输入检测字符串:", fingerprint);
    if (v && v.trim()) {
      fingerprint = v.trim();
      GM_setValue("immersiveFingerprint", fingerprint);
      alert("保存成功，刷新页面生效");
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const norm = (s) =>
    (s || "")
      .replace(/\s/g, "")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .toLowerCase();

  function toast(msg) {
    let old = document.querySelector("#yt-auto-toast");
    if (old) old.remove();

    const el = document.createElement("div");
    el.id = "yt-auto-toast";
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      top: "80px",
      right: "25px",
      zIndex: 999999999,
      background: "rgba(0,0,0,.85)",
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "14px",
    });

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function wait(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();

      const loop = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(loop, 100);
      };

      loop();
    });
  }

  function hasImmersive() {
    const key = fingerprint.toLowerCase();

    if (document.querySelector(`[class*="${key}"],[id*="${key}"]`)) return true;

    const text = document.body.innerText.toLowerCase();

    return ["immersive", "immersive-translate", "沉浸式翻译"].some((k) =>
      text.includes(k),
    );
  }

  function findMenu(keys) {
    for (const item of document.querySelectorAll(".ytp-menuitem")) {
      const text = norm(item.textContent);
      if (keys.some((k) => text.includes(norm(k)))) return item;
    }
    return null;
  }

  function clickSettings() {
    const btn = document.querySelector(".ytp-settings-button");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function closeSettings() {
    const btn = document.querySelector(".ytp-settings-button");
    if (btn) btn.click();
  }

  function enableCC() {
    const btn = document.querySelector(".ytp-subtitles-button");

    if (btn && btn.getAttribute("aria-pressed") === "false") {
      btn.click();
      return true;
    }

    return false;
  }

  async function selectChinese() {
    let item = findMenu(CONFIG.chinese);

    if (item) {
      item.click();
      return "中文字幕";
    }

    item = findMenu(CONFIG.translate);

    if (item) {
      item.click();

      await sleep(600);

      item = findMenu(CONFIG.chinese);

      if (item) {
        item.click();
        return "自动翻译中文";
      }
    }

    return null;
  }

  let lastVideo = "";

  async function run() {
    if (location.pathname != "/watch") return;

    if (hasImmersive()) {
      toast("⏸ 检测到沉浸式翻译，脚本停止");
      return;
    }

    const id = new URLSearchParams(location.search).get("v");

    if (!id || id === lastVideo) return;

    await wait("video");

    lastVideo = id;

    await sleep(1500);

    enableCC();

    await sleep(500);

    if (!clickSettings()) return;

    await sleep(800);

    const sub = findMenu(CONFIG.subtitle);

    if (!sub) {
      closeSettings();
      toast("ℹ️ 当前视频没有字幕");
      return;
    }

    sub.click();

    await sleep(500);

    const result = await selectChinese();

    closeSettings();

    toast(result ? "✅ 已开启" + result : "⚠️ 未找到中文字幕");
  }

  let oldUrl = location.href;

  setInterval(() => {
    if (location.href !== oldUrl) {
      oldUrl = location.href;
      lastVideo = "";
      run();
    }
  }, 1000);

  window.addEventListener("load", run);
})();

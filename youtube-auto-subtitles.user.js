// ==UserScript==
// @name         📺 YouTube自动中文字幕
// @namespace    https://github.com/jbaoyin/userscripts
// @version      3.2.0
// @description  自动开启YouTube中文字幕，无中文字幕时自动翻译中文
// @author       jbaoyin
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        none
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// ==/UserScript==

(() => {
    "use strict";
    const C = {
        zh: ["中文(简体)", "中文（简体）", "简体中文", "Chinese (Simplified)"],
        tr: ["自动翻译", "Auto-translate", "Auto translate"],
        sub: ["字幕", "Subtitles", "Captions"]
    };
    let last = "", running = false;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const norm = t => (t || "").replace(/\s/g, "").replace(/[（）]/g, m => m === "（" ? "(" : ")").toLowerCase();

    const toast = msg => {
        document.querySelector("#yt-auto-toast")?.remove();
        const b = Object.assign(document.createElement("div"), { id: "yt-auto-toast", textContent: msg });
        Object.assign(b.style, {
            position: "fixed", top: "80px", right: "20px", zIndex: "999999",
            background: "rgba(0,0,0,.85)", color: "#fff", padding: "10px 15px", borderRadius: "8px", fontSize: "14px"
        });
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 3000);
    };

    const find = keys => Array.from(document.querySelectorAll(".ytp-popup.ytp-settings-menu .ytp-menuitem"))
        .find(el => keys.some(k => norm(el.innerText).includes(norm(k))));

    async function run() {
        if (location.pathname !== "/watch" || running) return;
        const id = new URLSearchParams(location.search).get("v");
        if (!id || id === last) return;
        running = true; last = id;

        const start = Date.now();
        while (!document.querySelector("video") && Date.now() - start < 8000) await sleep(200);
        await sleep(800);

        const subBtn = document.querySelector(".ytp-subtitles-button");
        if (subBtn?.getAttribute("aria-pressed") === "false") subBtn.click();
        await sleep(300);

        const setBtn = document.querySelector(".ytp-settings-button");
        if (!setBtn) { running = false; return; }
        setBtn.click(); await sleep(400);

        const subMenu = find(C.sub);
        if (!subMenu) { setBtn.click(); toast("ℹ️ 当前视频没有字幕"); running = false; return; }
        subMenu.click(); await sleep(400);

        let res = find(C.zh);
        if (!res) {
            const trMenu = find(C.tr);
            if (trMenu) {
                trMenu.click(); await sleep(500);
                res = find(C.zh);
            }
        }
        res?.click();

        setBtn.click();
        toast(res ? "✅ 已开启中文字幕" : "⚠️ 未找到中文选项");
        running = false;
    }

    setInterval(() => {
        const id = new URLSearchParams(location.search).get("v");
        if (id && id !== last) run();
    }, 1000);

    if (location.pathname === "/watch") setTimeout(run, 1500);
})();

// ==UserScript==
// @name         📺 YouTube自动中文字幕
// @namespace    https://github.com/jbaoyin/userscripts
// @version      3.1.1
// @description  自动开启YouTube中文字幕，无中文字幕时自动翻译中文
// @author       jbaoyin
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        none
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/youtube-auto-subtitles.user.js
// ==/UserScript==

(function () {
    "use strict";

    const CONFIG = {
        chinese: [
            "中文(简体)",
            "中文（简体）",
            "简体中文",
            "Chinese (Simplified)"
        ],
        translate: [
            "自动翻译",
            "Auto-translate",
            "Auto translate"
        ],
        subtitle: [
            "字幕",
            "Subtitles",
            "Captions"
        ]
    };

    let lastVideo = "";

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    const normalize = text =>
        (text || "")
            .replace(/\s/g, "")
            .replace(/（/g, "(")
            .replace(/）/g, ")")
            .toLowerCase();

    function toast(message) {
        const old = document.querySelector("#yt-auto-toast");
        if (old) old.remove();

        const box = document.createElement("div");
        box.id = "yt-auto-toast";
        box.textContent = message;

        Object.assign(box.style, {
            position: "fixed",
            top: "80px",
            right: "20px",
            zIndex: 999999,
            background: "rgba(0,0,0,.85)",
            color: "#fff",
            padding: "10px 15px",
            borderRadius: "8px",
            fontSize: "14px"
        });

        document.body.appendChild(box);

        setTimeout(() => {
            box.remove();
        }, 3000);
    }

    async function waitFor(selector, timeout = 8000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(200);
        }

        return null;
    }

    function findMenuItem(keys) {
        for (const item of document.querySelectorAll(".ytp-menuitem")) {
            const text = normalize(item.innerText);
            if (keys.some(key => text.includes(normalize(key)))) {
                return item;
            }
        }
        return null;
    }

    function getSubtitleButton() {
        return document.querySelector(".ytp-subtitles-button");
    }

    function enableSubtitle() {
        const btn = getSubtitleButton();
        if (btn && btn.getAttribute("aria-pressed") === "false") {
            btn.click();
            return true;
        }
        return false;
    }

    function openSettings() {
        const btn = document.querySelector(".ytp-settings-button");
        if (!btn) return false;
        btn.click();
        return true;
    }

    function closeSettings() {
        const btn = document.querySelector(".ytp-settings-button");
        if (btn) btn.click();
    }

    async function selectChinese() {
        let item = findMenuItem(CONFIG.chinese);
        if (item) {
            item.click();
            return "中文字幕";
        }

        item = findMenuItem(CONFIG.translate);
        if (item) {
            item.click();
            await sleep(800);
            item = findMenuItem(CONFIG.chinese);
            if (item) {
                item.click();
                return "自动翻译中文";
            }
        }

        return null;
    }

    async function run() {
        if (location.pathname !== "/watch") return;

        const videoId = new URLSearchParams(location.search).get("v");
        if (!videoId || videoId === lastVideo) return;

        await waitFor("video");
        await sleep(1000);

        enableSubtitle();
        await sleep(500);

        if (!openSettings()) return;
        await sleep(600);

        const subtitle = findMenuItem(CONFIG.subtitle);
        if (!subtitle) {
            closeSettings();
            toast("ℹ️ 当前视频没有字幕");
            lastVideo = videoId;
            return;
        }

        subtitle.click();
        await sleep(700);

        const result = await selectChinese();
        closeSettings();

        toast(result ? "✅ " + result : "⚠️ 未找到中文");
        lastVideo = videoId;
    }

    // 监听 YouTube 无刷新切换视频
    setInterval(() => {
        const id = new URLSearchParams(location.search).get("v");
        if (id && id !== lastVideo) {
            run();
        }
    }, 1500);
})();

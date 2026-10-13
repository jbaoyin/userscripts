// ==UserScript==
// @name         📺 YouTube自动中文字幕
// @namespace    https://github.com/jbaoyin/userscripts
// @version      3.2.0
// @description  自动开启YouTube中文字幕，无中文字幕时自动翻译中文。
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
    let isRunning = false;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
            fontSize: "14px",
            transition: "opacity 0.3s ease"
        });

        document.body.appendChild(box);
        setTimeout(() => {
            box.style.opacity = "0";
            setTimeout(() => box.remove(), 300);
        }, 2500);
    }

    async function waitFor(selector, timeout = 6000, interval = 150) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(interval);
        }
        return null;
    }

    function findMenuItem(keys) {
        for (const item of document.querySelectorAll(".ytp-popup.ytp-settings-menu .ytp-menuitem")) {
            const text = normalize(item.innerText);
            if (keys.some(key => text.includes(normalize(key)))) {
                return item;
            }
        }
        return null;
    }

    function isSettingsOpen() {
        const menu = document.querySelector(".ytp-popup.ytp-settings-menu");
        return menu && menu.style.display !== "none";
    }

    async function toggleSettings(open) {
        const btn = document.querySelector(".ytp-settings-button");
        if (!btn) return false;
        
        const currentlyOpen = isSettingsOpen();
        if (currentlyOpen !== open) {
            btn.click();
            await waitFor(".ytp-popup.ytp-settings-menu", 2000, 100);
        }
        return true;
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
            // 等待翻译二级菜单渲染
            const start = Date.now();
            while (Date.now() - start < 1500) {
                await sleep(100);
                let chineseItem = findMenuItem(CONFIG.chinese);
                if (chineseItem) {
                    chineseItem.click();
                    return "自动翻译中文";
                }
            }
        }

        return null;
    }

    async function run() {
        if (location.pathname !== "/watch" || isRunning) return;
        
        const videoId = new URLSearchParams(location.search).get("v");
        if (!videoId || videoId === lastVideo) return;

        isRunning = true;
        lastVideo = videoId;

        try {
            // 1. 等待视频元素及播放器就绪
            const videoEl = await waitFor("video", 10000);
            if (!videoEl) return;
            await sleep(800);

            // 2. 检查并开启字幕按钮
            const subBtn = document.querySelector(".ytp-subtitles-button");
            if (subBtn && subBtn.getAttribute("aria-pressed") === "false") {
                subBtn.click();
                await sleep(300);
            }

            // 3. 打开设置面板
            if (!(await toggleSettings(true))) return;
            await sleep(200);

            // 4. 寻找“字幕”菜单项
            let subtitleItem = findMenuItem(CONFIG.subtitle);
            if (!subtitleItem) {
                await toggleSettings(false);
                toast("ℹ️ 当前视频没有字幕");
                return;
            }

            subtitleItem.click();
            await sleep(300);

            // 5. 选择中文或自动翻译
            const result = await selectChinese();
            
            // 6. 关闭设置面板
            await toggleSettings(false);

            if (result) {
                toast(`✅ 已开启${result}`);
            } else {
                toast("⚠️ 未找到中文选项");
            }
        } catch (e) {
            console.error("YouTube Auto Subtitles Error:", e);
        } finally {
            isRunning = false;
        }
    }

    // 优化路由监听：结合 pushState/replaceState 拦截与定时轮询兜底
    let lastPath = location.href;
    const checkPageChange = () => {
        if (location.href !== lastPath) {
            lastPath = location.href;
            if (location.pathname === "/watch") {
                // 延迟触发，等待新视频页面加载
                setTimeout(run, 1200);
            }
        }
    };

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        checkPageChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        checkPageChange();
    };

    window.addEventListener("popstate", checkPageChange);

    // 兜底轮询（防止部分 YouTube 内部跳转无法被 history 拦截）
    setInterval(checkPageChange, 1500);

    // 初始加载运行
    if (location.pathname === "/watch") {
        setTimeout(run, 1500);
    }
})();

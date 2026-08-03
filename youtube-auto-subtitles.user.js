// ==UserScript==
// @name         📺 YouTube自动字幕
// @description  自动开启YouTube中文字幕（含自动翻译回退）
// @version      1.1.2
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

(function () {
    'use strict';

    const LANG_KEYWORDS = ['中文(简体)', '中文（简体）', '简体中文', 'Chinese (Simplified)'];
    const AUTO_TRANSLATE_KEYWORDS = ['自动翻译', 'Auto-translate', 'Auto translate'];
    let fingerprint = GM_getValue('imtFingerprint', 'immersive-translate');

    GM_registerMenuCommand('✏️ 设置沉浸式翻译特征字符串', () => {
        const input = prompt('输入沉浸式翻译的class/id特征字符串：', fingerprint);
        if (input !== null && input.trim()) {
            fingerprint = input.trim();
            GM_setValue('imtFingerprint', fingerprint);
            alert('已保存，刷新页面后生效');
        }
    });

    function showToast(text, duration = 3000) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText =
            'position:fixed;top:70px;right:20px;background:rgba(0,0,0,.85);color:#fff;' +
            'padding:10px 16px;border-radius:8px;font-size:13px;z-index:100000;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s';
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, duration);
    }

    const norm = (s) => s.replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')');

    const findMenuItem = (keywords) => {
        for (const item of document.querySelectorAll('.ytp-menuitem')) {
            const label = norm(item.textContent || '');
            if (keywords.some(k => label.includes(norm(k)))) return item;
        }
        return null;
    };

    const waitForElement = (selector, timeout = 3000) =>
        new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { observer.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
        });

    const waitMs = (ms) => new Promise(r => setTimeout(r, ms));

    const clickCC = () => {
        const btn = document.querySelector('.ytp-subtitles-button');
        if (btn && btn.getAttribute('aria-pressed') === 'false') btn.click();
    };

    const hasImmersiveTranslate = () =>
        !!document.querySelector(`[class*="${fingerprint}" i], [id*="${fingerprint}" i]`);

    const openSettingsMenu = async () => {
        const btn = document.querySelector('.ytp-settings-button');
        if (!btn) return false;
        btn.click();
        await waitForElement('.ytp-settings-menu:not([style*="display: none"]) .ytp-panel', 2000);
        return true;
    };

    const selectChineseSubtitle = async () => {
        let zhItem = findMenuItem(LANG_KEYWORDS);
        if (zhItem) { zhItem.click(); return true; }

        const autoItem = findMenuItem(AUTO_TRANSLATE_KEYWORDS);
        if (autoItem) {
            autoItem.click();
            await waitMs(600);
            await waitForElement('.ytp-settings-menu .ytp-panel', 2000);
            zhItem = findMenuItem(LANG_KEYWORDS);
            if (zhItem) { zhItem.click(); return true; }
        }
        return false;
    };

    const tryEnable = async () => {
        if (!document.querySelector('.html5-video-player')) return;
        await waitMs(800);
        clickCC();
        await waitMs(600);

        if (hasImmersiveTranslate()) {
            showToast('检测到沉浸式翻译已启用，跳过自动选择');
            return;
        }

        if (!(await openSettingsMenu())) {
            showToast('未找到设置按钮');
            return;
        }

        const subMenu = findMenuItem(['字幕', 'Subtitles', 'Captions']);
        if (subMenu) {
            subMenu.click();
            await waitMs(600);
            await waitForElement('.ytp-settings-menu .ytp-panel', 2000);
        }

        const ok = await selectChineseSubtitle();
        showToast(ok ? '✅ 已切换中文字幕' : '⚠️ 未找到中文字幕选项');
    };

    let lastUrl = '';
    const onNavigate = () => {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        tryEnable();
    };

    window.addEventListener('load', tryEnable);
    new MutationObserver(onNavigate).observe(document.body, { childList: true, subtree: true });
})();

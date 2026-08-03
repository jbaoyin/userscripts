// ==UserScript==
// @name         🔓 强制启用文字复制
// @description  在网页中强制允许选中和复制文字
// @version      1.0.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/force-copy.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/force-copy.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== 1. 事件拦截（捕获阶段，覆盖 document + window）==========
    const blockedEvents = [
        'copy', 'cut', 'paste', 'contextmenu',
        'selectstart', 'dragstart', 'mousedown', 'mouseup'
    ];

    const allowHandler = (e) => e.stopPropagation();

    blockedEvents.forEach(event => {
        document.addEventListener(event, allowHandler, true);
        window.addEventListener(event, allowHandler, true);
    });

    // ========== 2. CSS 全局强制选中 ==========
    const style = document.createElement('style');
    style.id = '__force-copy-enhanced__';
    style.textContent = `
        *, *::before, *::after {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }
        body {
            -webkit-touch-callout: default !important;
        }
        *::before, *::after {
            pointer-events: none !important;
        }
    `;
    (document.documentElement || document).appendChild(style);

    // ========== 3. 清理内联事件属性与内联 userSelect 样式 ==========
    const cleanNode = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const attrs = [
            'unselectable', 'oncopy', 'oncut', 'onpaste',
            'onselectstart', 'oncontextmenu', 'ondragstart'
        ];
        attrs.forEach(attr => {
            if (node.hasAttribute(attr)) node.removeAttribute(attr);
        });
        if (node.style.userSelect || node.style.webkitUserSelect) {
            node.style.removeProperty('user-select');
            node.style.removeProperty('-webkit-user-select');
        }
    };

    const initialClean = () => {
        document.querySelectorAll('*').forEach(cleanNode);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialClean, { once: true });
    } else {
        initialClean();
    }

    // ========== 4. MutationObserver 轻量持续清理 ==========
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    cleanNode(node);
                    node.querySelectorAll?.('*').forEach(cleanNode);
                }
            });
            if (mutation.type === 'attributes') {
                cleanNode(mutation.target);
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
            'unselectable', 'oncopy', 'oncut', 'onpaste',
            'onselectstart', 'oncontextmenu', 'ondragstart', 'style'
        ]
    });
})();

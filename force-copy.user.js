// ==UserScript==
// @name         🔓 强制文字复制
// @description  解除网页禁止选中/复制的限制，当前支持：QQ阅读。
// @version      1.0.0
// @author       jbaoyin
// @namespace    https://github.com/jbaoyin/userscripts
// @license      MIT
// @match        *://book.qq.com/*
// @grant        none
// @run-at       document-start
// @downloadURL  https://github.com/jbaoyin/userscripts/raw/refs/heads/main/force-copy.user.js
// @updateURL    https://github.com/jbaoyin/userscripts/raw/refs/heads/main/force-copy.user.js
// ==/UserScript==

(function () {
    'use strict';

    const Core = {
        injectCSS(extraCSS) {
            const s = document.createElement('style');
            s.id = '__force-copy-core__';
            s.textContent = `*,*::before,*::after{user-select:text!important;-webkit-user-select:text!important;-moz-user-select:text!important;-ms-user-select:text!important;-webkit-touch-callout:default!important}${extraCSS}`;
            (document.documentElement || document).appendChild(s);
        },

        cleanNode(node, attrs) {
            if (node.nodeType !== 1) return;
            attrs.forEach(a => node.removeAttribute(a));
            ['user-select', '-webkit-user-select'].forEach(p => node.style.removeProperty(p));
        },

        startCleaner(attrs) {
            const clean = n => this.cleanNode(n, attrs);
            const init = () => document.querySelectorAll('*').forEach(clean);
            document.readyState === 'loading'
                ? document.addEventListener('DOMContentLoaded', init, { once: true })
                : init();
            new MutationObserver(ms => ms.forEach(m => {
                if (m.type === 'attributes') clean(m.target);
                else m.addedNodes.forEach(n => { if (n.nodeType === 1) { clean(n); n.querySelectorAll?.('*').forEach(clean); } });
            })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: [...attrs, 'style'] });
        },

        preemptEvents(types) {
            types.forEach(t => {
                const h = e => e.stopImmediatePropagation();
                document.addEventListener(t, h, true);
                window.addEventListener(t, h, true);
            });
        },

        init({ extraCSS = '', extraAttrs = [], preemptEventTypes = [], onReady = null } = {}) {
            this.injectCSS(extraCSS);
            this.startCleaner([...new Set(['unselectable', 'oncopy', 'oncut', 'onpaste', 'onselectstart', 'oncontextmenu', 'ondragstart', ...extraAttrs])]);
            if (preemptEventTypes.length) this.preemptEvents(preemptEventTypes);
            if (typeof onReady === 'function') {
                document.readyState === 'loading'
                    ? document.addEventListener('DOMContentLoaded', () => onReady(document), { once: true })
                    : onReady(document);
            }
        }
    };

    const SITES = {
        'book.qq.com': {
            extraCSS: `[class*="mask"],[class*="overlay"],[class*="block-layer"]{pointer-events:none!important}.reader-container,.chapter-content,.read-content,.text-content,p,span{cursor:text!important}`,
            extraAttrs: ['data-copyblock', 'data-noselect'],
            preemptEventTypes: ['copy', 'cut', 'selectstart', 'contextmenu', 'dragstart'],
            onReady(doc) {
                const reClean = () => doc.querySelectorAll('.chapter-content,.read-content,.text-content').forEach(el => {
                    el.style.removeProperty('user-select');
                    el.style.removeProperty('-webkit-user-select');
                    ['unselectable', 'data-copyblock', 'data-noselect'].forEach(a => el.removeAttribute(a));
                });
                const t = doc.querySelector('#app') || doc.body;
                if (t) new MutationObserver(reClean).observe(t, { childList: true, subtree: true });
                reClean();
            }
        }
    };

    Core.init(SITES[location.hostname] || {});
})();

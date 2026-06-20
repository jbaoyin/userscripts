// ==UserScript==
// @name         🔍 聚合搜索
// @description  整合DuckDuckGo、Bing、Google，支持自动翻页、暗色模式、置顶
// @version      1.0.1
// @author       jbaoyin
// @license      MIT
// @match        *://duckduckgo.com/*
// @match        *://cn.bing.com/search*
// @match        *://www.google.com.hk/search*
// @match        *://www.google.com/search*
// @grant        none
// @downloadURL  https://github.com/jbaoyin/aggregate-search/raw/refs/heads/main/aggregate-search.user.js
// @updateURL    https://github.com/jbaoyin/aggregate-search/raw/refs/heads/main/aggregate-search.user.js
// ==/UserScript==

!(function () {
  "use strict";
  const e = [
      {
        name: "DDG",
        url: "https://duckduckgo.com/?q=",
        param: "q",
        test: /duckduckgo\.com/,
        pageParam: "s",
        pageStep: 50,
        auto: !1,
      },
      {
        name: "Bing",
        url: "https://cn.bing.com/search?q=",
        param: "q",
        test: /bing\.com/,
        pageParam: "first",
        pageStep: 10,
        auto: !0,
      },
      {
        name: "Google",
        url: "https://www.google.com/search?q=",
        param: "q",
        test: /google\.com/,
        pageParam: "start",
        pageStep: 10,
        auto: !0,
      },
    ],
    t = [".results", "#b_results", "#search"],
    n = "sa_pos",
    r = "sa_auto",
    s = e.find((e) => e.test.test(location.href));
  if (!s) return;
  const a = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let c = "false" !== localStorage.getItem(r),
    i = 1,
    d = !1;
  const p = a
    ? {
        bg: "#2d2d2d",
        bg2: "#3a3a3a",
        bgOn: "#2d4a2d",
        bd: "#555",
        tx: "#e0e0e0",
        tx2: "#b0b0b0",
        on: "#4CAF50",
        hv: "#3a3a3a",
        sh: "rgba(0,0,0,.3)",
      }
    : {
        bg: "#fff",
        bg2: "#f5f5f5",
        bgOn: "#e8f5e8",
        bd: "#e0e0e0",
        tx: "#333",
        tx2: "#666",
        on: "#4CAF50",
        hv: "#f9f9f9",
        sh: "rgba(0,0,0,.1)",
      };
  function m(e = document) {
    for (const o of t) {
      const t = e.querySelector(o);
      if (t) return t;
    }
    return null;
  }
  function u(e, t = 1500) {
    let o = document.getElementById("sa-tip");
    (o ||
      ((o = document.createElement("div")),
      (o.id = "sa-tip"),
      (o.style.cssText =
        "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.85);color:#fff;padding:14px 24px;border-radius:10px;font-size:14px;z-index:100000;pointer-events:none;display:none"),
      document.body.appendChild(o)),
      (o.textContent = e),
      (o.style.display = "block"),
      clearTimeout(o._t),
      (o._t = setTimeout(() => {
        o.style.display = "none";
      }, t)));
  }
  function f() {
    const e = document.createElement("div");
    ((e.style.cssText =
      "position:fixed;bottom:80px;right:30px;width:48px;height:48px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:50%;text-align:center;line-height:48px;font-size:22px;cursor:pointer;display:none;z-index:99998;box-shadow:0 4px 12px rgba(102,126,234,.4);transition:transform .2s"),
      (e.textContent = "⬆"),
      (e.onmouseover = () =>
        (e.style.transform = "translateY(-4px) scale(1.1)")),
      (e.onmouseout = () => (e.style.transform = "")),
      (e.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" })),
      document.body.appendChild(e));
    const t = (function () {
      let j = 0,
        k = null;
      const run = () => {
        ((j = Date.now()), (k = null));
        const t = window.scrollY,
          o = window.innerHeight,
          n = document.documentElement.scrollHeight;
        ((e.style.display = t > 300 ? "block" : "none"),
          t >= 100 &&
            c &&
            s.auto &&
            !d &&
            i < 10 &&
            t + o >= n - 300 &&
            (async function () {
              if (!(i >= 10 || d)) {
                ((d = !0), i++, u(`⏳ 正在加载第 ${i} 页...`));
                try {
                  const e = new URL(location.href);
                  e.searchParams.set(s.pageParam, (i * s.pageStep).toString());
                  const t = await fetch(e, {
                    headers: { Accept: "text/html" },
                  });
                  if (!t.ok) throw 0;
                  const o = m(
                      new DOMParser().parseFromString(
                        await t.text(),
                        "text/html",
                      ),
                    ),
                    n = m();
                  if (o && n) {
                    const e = document.createElement("div");
                    ((e.textContent = `━━━ 第 ${i} 页 ━━━`),
                      (e.style.cssText = `margin:28px 0;padding:11px;text-align:center;background:${p.bg2};color:${p.tx};border-radius:8px;font-weight:bold`),
                      n.appendChild(e),
                      Array.from(o.children).forEach((e) => {
                        e.classList.contains("page") || n.appendChild(e);
                      }));
                  }
                  const r = document.getElementById("sa-pg");
                  r && (r.textContent = `📄 第 ${i} 页`);
                } catch {
                  (u("❌ 翻页失败"), i--);
                } finally {
                  d = !1;
                }
              }
            })());
      };
      return () => {
        const n = Date.now(),
          rem = 300 - (n - j);
        rem <= 0
          ? (clearTimeout(k), (k = null), run())
          : k || (k = setTimeout(run, rem));
      };
    })();
    (window.addEventListener("scroll", t, { passive: !0 }),
      new ResizeObserver(() => {
        window.scrollY >= 100 && t();
      }).observe(document.documentElement));
  }
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => location.reload());
  const h = document.createElement("style");
  function b() {
    (!(function () {
      const t = document.createElement("div");
      t.id = "sa-bar";
      const o = (() => {
        try {
          return JSON.parse(localStorage.getItem(n));
        } catch {
          return null;
        }
      })();
      t.style.cssText = `position:fixed;${o ? `left:${o.x}px;top:${o.y}px` : "left:10px;top:50%;transform:translateY(-50%)"};width:118px;background:${p.bg};border:1px solid ${p.bd};border-radius:12px;font-size:12px;z-index:99999;box-shadow:0 6px 16px ${p.sh};font-family:system-ui,Arial,sans-serif`;
      const a = document.createElement("div");
      ((a.style.cssText = `text-align:center;padding:11px 0;border-bottom:1px solid ${p.bd};cursor:move`),
        (a.innerHTML = `<div style="font-size:14px;font-weight:bold;color:${p.tx}">🔍 聚合搜索</div><div style="font-size:10px;color:${p.tx2}">by jbaoyin</div>`),
        t.appendChild(a),
        e.forEach((e) => {
          const o = document.createElement("div");
          o.textContent = e.name;
          const n = e.name === s.name;
          ((o.style.cssText = `padding:9px 0;text-align:center;cursor:pointer;border-top:1px solid ${p.bd};color:${n ? "#fff" : p.tx};background:${n ? p.on : ""};font-weight:${n ? "bold" : "normal"};transition:background .15s`),
            n ||
              ((o.onmouseover = () => (o.style.background = p.hv)),
              (o.onmouseout = () => (o.style.background = "")),
              (o.onclick = () => {
                const t =
                  new URLSearchParams(location.search).get(s.param) || "";
                t &&
                  (u("跳转中..."),
                  setTimeout(() => {
                    location.href = e.url + encodeURIComponent(t);
                  }, 250));
              })),
            t.appendChild(o));
        }));
      const i = document.createElement("div"),
        d = () => {
          ((i.innerHTML = `🔄 翻页: <b>${c ? "ON" : "OFF"}</b>`),
            (i.style.background = c ? p.bgOn : p.bg2));
        };
      ((i.style.cssText = `padding:9px;text-align:center;cursor:pointer;border-top:1px solid ${p.bd};color:${p.tx};user-select:none`),
        d(),
        (i.onclick = () => {
          ((c = !c), localStorage.setItem(r, c), d());
        }),
        s.auto && t.appendChild(i));
      const m = document.createElement("div");
      ((m.id = "sa-pg"),
        (m.style.cssText = `padding:7px;text-align:center;font-size:10px;color:${p.tx2};border-top:1px solid ${p.bd}`),
        (m.textContent = "📄 第 1 页"),
        t.appendChild(m));
      let x,
        f,
        h,
        b,
        y = !1;
      ((a.onmousedown = (e) => {
        ((y = !0), (x = e.clientX), (f = e.clientY));
        const o = t.getBoundingClientRect();
        ((h = o.left),
          (b = o.top),
          (t.style.transform = "none"),
          e.preventDefault());
      }),
        document.addEventListener("mousemove", (e) => {
          y &&
            ((t.style.left = h + e.clientX - x + "px"),
            (t.style.top = b + e.clientY - f + "px"));
        }),
        document.addEventListener("mouseup", () => {
          if (y) {
            y = !1;
            try {
              localStorage.setItem(
                n,
                JSON.stringify({
                  x: parseInt(t.style.left),
                  y: parseInt(t.style.top),
                }),
              );
            } catch {}
          }
        }),
        document.body.appendChild(t));
    })(),
      f());
  }
  ((h.textContent = `#sa-bar:hover{box-shadow:0 8px 24px ${p.sh}!important}`),
    document.head.appendChild(h),
    "loading" === document.readyState
      ? document.addEventListener("DOMContentLoaded", () => setTimeout(b, 100))
      : setTimeout(b, 100));
})();

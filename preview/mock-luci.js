'use strict';
// 极简 LuCI API 模拟，仅用于静态预览
(function () {
  window._ = function (s) { return s; };

  window.E = function (tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'click' && typeof attrs[k] === 'function') {
        el.addEventListener('click', attrs[k]);
      } else if (k === 'class') {
        el.className = attrs[k];
      } else if (k in el) {
        try { el[k] = attrs[k]; } catch (e) { el.setAttribute(k, attrs[k]); }
      } else {
        el.setAttribute(k, attrs[k]);
      }
    });
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) {
        if (c == null) return;
        if (c instanceof Node) el.appendChild(c);
        else el.appendChild(document.createTextNode(String(c)));
      });
    }
    return el;
  };

  window.ui = {
    addNotification: function (_title, node, level) {
      var box = document.createElement('div');
      box.className = 'notice ' + (level === 'danger' ? 'notice-danger' : 'notice-info');
      if (typeof node === 'string') box.textContent = node; else box.appendChild(node);
      document.getElementById('app').prepend(box);
      setTimeout(function () { box.remove(); }, 3000);
    },
    confirm: function (message, sub) {
      var text = message + (sub ? ('\n' + sub) : '');
      return Promise.resolve(window.confirm(text));
    },
    await: function (promise, _label) { return promise; }
  };

  window.L = {
    url: function () { return '#'; },
    fetch: function (_url, _opts) {
      // 使用本地 data.json 模拟返回
      return fetch('data.json');
    }
  };
})();

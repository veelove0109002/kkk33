'use strict';
(function () {
  function renderApp() {
    var root = E('div', { 'class': 'cbi-map' }, [
      E('h2', {}, _('Uninstall Packages')),
      E('div', { 'class': 'cbi-section-descr' }, _('选择要卸载的已安装软件包。可选地同时删除其配置文件。')),
      E('div', { 'class': 'toolbar' }, [
        E('input', { id: 'filter', type: 'text', placeholder: _('筛选包名…'), 'style': 'flex:1;' }),
        E('label', {}, [
          E('input', { id: 'purge', type: 'checkbox' }),
          _('删除配置文件')
        ])
      ])
    ]);

    var table = E('table', { 'class': 'table' }, [
      E('tr', {}, [
        E('th', {}, _('包名')),
        E('th', {}, _('版本')),
        E('th', {}, '')
      ])
    ]);

    root.appendChild(table);

    function refresh() {
      L.fetch(L.url('admin/system/uninstall/list'), { headers: { 'Accept': 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var pkgs = (data && data.packages) || [];
          var q = (document.getElementById('filter').value || '').toLowerCase();
          var tbody = E('tbody', {});
          pkgs.filter(function (p) { return !q || p.name.toLowerCase().includes(q); }).forEach(function (p) {
            var btn = E('button', { 'class': 'btn cbi-button cbi-button-remove', click: function () { uninstall(p.name); } }, _('卸载'));
            tbody.appendChild(E('tr', {}, [
              E('td', {}, p.name),
              E('td', {}, p.version || ''),
              E('td', { 'style': 'text-align:right;' }, btn)
            ]));
          });
          var old = table.querySelector('tbody');
          if (old) old.remove();
          table.appendChild(tbody);
        })
        .catch(function (err) {
          ui.addNotification(null, E('p', {}, _('加载软件包列表失败: ') + String(err)), 'danger');
        });
    }

    function uninstall(name) {
      var purge = document.getElementById('purge').checked;
      ui.await(
        ui.confirm('确定卸载包 ' + name + ' ？', purge ? '同时删除配置文件。' : '').then(function (ok) {
          if (!ok) return;
          // 预览环境只做提示
          ui.addNotification(null, E('p', {}, '模拟卸载：' + name + (purge ? '（含配置）' : '')), null);
        })
      );
    }

    root.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'filter') refresh();
    });

    refresh();
    return root;
  }

  document.getElementById('app').appendChild(renderApp());
})();

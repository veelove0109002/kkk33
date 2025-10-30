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

    // 卡片栅格
    var grid = E('div', { 'class': 'card-grid' });
    root.appendChild(grid);

    var DEFAULT_ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2" ry="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>');
    function packageIcon(name){ return L.resource('icons/' + name + '.png'); }

    function renderCard(pkg){
      var img = E('img', { src: packageIcon(pkg.name), alt: pkg.name });
      img.addEventListener('error', function(){ img.src = DEFAULT_ICON; });
      var title = E('div', { 'class': 'pkg-title' }, pkg.name);
      var ver = E('div', { 'class': 'pkg-ver' }, (pkg.version || ''));
      var btn = E('button', { 'class': 'btn cbi-button cbi-button-remove' }, _('卸载'));
      btn.addEventListener('click', function(){ uninstall(pkg.name); });
      return E('div', { 'class': 'pkg-card' }, [img, title, ver, btn]);
    }

    function refresh() {
      L.fetch(L.url('admin/system/uninstall/list'), { headers: { 'Accept': 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var pkgs = (data && data.packages) || [];
          var q = (document.getElementById('filter').value || '').toLowerCase();
          var list = pkgs.filter(function (p) { return !q || p.name.toLowerCase().includes(q); });
          while (grid.firstChild) grid.removeChild(grid.firstChild);
          list.forEach(function (p) { grid.appendChild(renderCard(p)); });
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

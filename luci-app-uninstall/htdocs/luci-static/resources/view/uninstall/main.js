// SPDX-License-Identifier: Apache-2.0
'use strict';
'require view';
'require rpc';
'require ui';

return view.extend({
	load: function() {
		return Promise.resolve();
	},


	// Helper to fetch JSON across different LuCI versions
	_httpJson: function(url, options) {
		options = options || {};
		if (L && L.Request && typeof L.Request.request === 'function') {
			return L.Request.request(url, options).then(function(res){ return res.json(); });
		}
		if (typeof fetch === 'function') {
			options.credentials = 'include';
			return fetch(url, options).then(function(res){
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.json();
			});
		}
		return Promise.reject(new Error('No HTTP client available'));
	},

	pollList: function() {
		return this._httpJson(L.url('admin/system/uninstall/list'), { headers: { 'Accept': 'application/json' } });
	},

	render: function() {
		var self = this;
		var root = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Uninstall Packages')),
			E('div', { 'class': 'cbi-section-descr' }, _('选择要卸载的已安装软件包。可选地同时删除其配置文件。')),
			E('div', { 'style': 'margin:8px 0; display:flex; gap:8px; align-items:center;' }, [
				E('input', { id: 'filter', type: 'text', placeholder: _('筛选包名…'), 'style': 'flex:1;' }),
				E('label', { 'style': 'display:flex; align-items:center; gap:6px;' }, [
					E('input', { id: 'purge', type: 'checkbox' }),
					_('删除配置文件')
				])
			])
		]);

		// Default icon (inline SVG as data URI)
		var DEFAULT_ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2" ry="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>');
		function packageIcon(name){
			// Try common icon path under luci-static/resources/icons
			return L.resource('icons/' + name + '.png');
		}

		var grid = E('div', { 'class': 'card-grid', 'style': 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:8px;' });
		root.appendChild(grid);

		function renderCard(pkg){
			var img = E('img', { src: packageIcon(pkg.name), alt: pkg.name, width: 48, height: 48, 'style': 'border-radius:8px;background:#f3f4f6;object-fit:contain;' });
			img.addEventListener('error', function(){ img.src = DEFAULT_ICON; });
			var title = E('div', { 'style': 'font-weight:600;color:#111827;margin-top:6px;word-break:break-all;' }, pkg.name);
			var ver = E('div', { 'style': 'font-size:12px;color:#6b7280;margin-top:2px;' }, (pkg.version || ''));
			var btn = E('button', { 'class': 'btn cbi-button cbi-button-remove', 'style': 'margin-top:8px;' }, _('卸载'));
			btn.addEventListener('click', function(){ uninstall(pkg.name); });
			var card = E('div', { 'class': 'pkg-card', 'style': 'display:flex;flex-direction:column;align-items:flex-start;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.04);' }, [img, title, ver, btn]);
			return card;
		}

		function refresh() {
			self.pollList().then(function(data){
				var pkgs = (data && data.packages) || [];
				var q = (document.getElementById('filter').value || '').toLowerCase();
				var list = pkgs.filter(function(p){ return !q || p.name.toLowerCase().includes(q); });
				// Clear grid
				while (grid.firstChild) grid.removeChild(grid.firstChild);
				list.forEach(function(p){ grid.appendChild(renderCard(p)); });
			}).catch(function(err){
				ui.addNotification(null, E('p', {}, _('加载软件包列表失败: ') + String(err)), 'danger');
			});
		}

		function uninstall(name) {
			var purge = document.getElementById('purge').checked;
			return ui.confirm((_('确定卸载包 %s ？').format ? _('确定卸载包 %s ？').format(name) : '确定卸载包 ' + name + ' ？'), purge ? _('同时删除配置文件。') : '').then(function(ok) {
				if (!ok) return;
				var removeUrl = L.url('admin/system/uninstall/remove') + (L.env && L.env.csrf_token ? ('?token=' + encodeURIComponent(L.env.csrf_token)) : '');
				return ui.await(self._httpJson(removeUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					body: JSON.stringify({ package: name, purge: purge })
				}), _('执行中…')).then(function(res) {
					if (res && res.ok) {
						ui.addNotification(null, E('p', {}, _('卸载成功')));
						refresh();
					} else {
						ui.addNotification(null, E('pre', {}, (res && res.message) || _('卸载失败')), 'danger');
					}
				}).catch(function(err) {
					ui.addNotification(null, E('p', {}, _('请求失败: ') + String(err)), 'danger');
				});
			});
		}

		root.addEventListener('input', function(ev) {
			if (ev.target && ev.target.id === 'filter') refresh();
		});

		refresh();
		return root;
	}
});

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
		var self = this;
		function once(){ return self._httpJson(L.url('admin/vum/uninstall/list'), { headers: { 'Accept': 'application/json' } }); }
		return once().then(function(res){
			if (res && res.packages && res.packages.length > 0) return res;
			// retry up to 2 times with small delay
			return new Promise(function(resolve){ setTimeout(resolve, 300); }).then(once).then(function(r){
				if (r && r.packages && r.packages.length > 0) return r;
				return new Promise(function(resolve){ setTimeout(resolve, 500); }).then(once);
			});
		});
	},

	render: function() {
		var self = this;
		var root = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('高级卸载')),
			E('div', { 'class': 'cbi-section-descr' }, _('选择要卸载的已安装软件包。可选地同时删除其配置文件。')),
			E('div', { 'style': 'margin:8px 0; display:flex; gap:8px; align-items:center;' }, [
				E('input', { id: 'filter', type: 'text', placeholder: _('筛选包名…'), 'style': 'flex:1;' })
			])
		]);

		// Default icon (inline SVG as data URI)
		var DEFAULT_ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2" ry="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>');
		function packageIcon(name){
			// Try common icon path under luci-static/resources/icons
			return L.resource('icons/' + name + '.png');
		}

		var grid = E('div', { 'class': 'card-grid', 'style': 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-top:8px;' });
		root.appendChild(grid);

		function renderCard(pkg){
			var img = E('img', { src: packageIcon(pkg.name), alt: pkg.name, width: 56, height: 56, 'style': 'border-radius:10px;background:#f3f4f6;object-fit:contain;border:1px solid #e5e7eb;' });
			img.addEventListener('error', function(){ img.src = DEFAULT_ICON; });
			var title = E('div', { 'style': 'font-weight:600;color:#111827;word-break:break-all;font-size:14px;' }, pkg.name);
			var verBadge = E('span', { 'style': 'font-size:12px;color:#2563eb;background:#e0f2fe;border-radius:999px;padding:2px 8px;' }, (pkg.version || ''));
			var purgeEl = E('input', { type: 'checkbox' });
			var purgeLabel = E('label', { 'style': 'display:flex; align-items:center; gap:6px;' }, [ purgeEl, _('删除配置文件') ]);
			var depsEl = E('input', { type: 'checkbox' });
			var depsLabel = E('label', { 'style': 'display:flex; align-items:center; gap:6px;' }, [ depsEl, _('同时卸载相关依赖') ]);
			var optionsRow = E('div', { 'style': 'display:flex; gap:12px; align-items:center; flex-wrap:wrap;' }, [ purgeLabel, depsLabel ]);
			var btn = E('button', { type: 'button', 'class': 'btn cbi-button cbi-button-remove' }, _('卸载'));
			btn.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); uninstall(pkg.name, purgeEl.checked, depsEl.checked); });
			var metaTop = E('div', { 'style': 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' }, [ title, verBadge ]);
			var metaCol = E('div', { 'class': 'pkg-meta', 'style': 'flex:1; display:flex; flex-direction:column; gap:6px;' }, [ metaTop, optionsRow ]);
			var actions = E('div', { 'class': 'pkg-actions', 'style': 'display:flex; align-items:center; margin-left:auto;' }, [ btn ]);
			var card = E('div', { 'class': 'pkg-card', 'style': 'display:flex; align-items:center; gap:12px; padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.04);' }, [ img, metaCol, actions ]);
			return card;
		}

		function refresh() {
			self.pollList().then(function(data){
				var pkgs = (data && data.packages) || [];
				var q = (document.getElementById('filter').value || '').toLowerCase();
				var list = pkgs.filter(function(p){ return p.name && p.name.indexOf('luci-app-') === 0; }).filter(function(p){ return !q || p.name.toLowerCase().includes(q); });
				// Clear grid
				while (grid.firstChild) grid.removeChild(grid.firstChild);
				list.forEach(function(p){ grid.appendChild(renderCard(p)); });
			}).catch(function(err){
				ui.addNotification(null, E('p', {}, _('加载软件包列表失败: ') + String(err)), 'danger');
			});
		}

		function uninstall(name, purge, removeDeps) {
			var confirmFn = (ui && typeof ui.confirm === 'function') ? ui.confirm : function(msg, desc){ return Promise.resolve(window.confirm(desc ? (msg + '\n' + desc) : msg)); };
			return confirmFn((_('确定卸载包 %s ？').format ? _('确定卸载包 %s ？').format(name) : '确定卸载包 ' + name + ' ？'), purge ? _('同时删除配置文件。') : '').then(function(ok) {
				if (!ok) return;

				// 日志弹窗
				var log = E('pre', { 'style': 'max-height:260px;overflow:auto;background:#0b1024;color:#cbd5e1;padding:10px;border-radius:8px;' }, '');
				var closeBtn = E('button', { 'class': 'btn', disabled: true }, _('关闭'));
				var modal = ui.showModal(_('正在卸载…') + ' ' + name, [
					log,
					E('div', { 'style':'margin-top:10px;display:flex;gap:8px;justify-content:flex-end;' }, [ closeBtn ])
				]);
				function println(s){ log.appendChild(document.createTextNode(String(s) + '\n')); log.scrollTop = log.scrollHeight; }
				function enableClose(){ closeBtn.disabled = false; closeBtn.addEventListener('click', function(){ ui.hideModal(modal); }); }

				var token = (L.env && (L.env.token || L.env.csrf_token)) || '';
				var removeUrl = L.url('admin/vum/uninstall/remove') + (token ? ('?token=' + encodeURIComponent(token)) : '');
				var formBody = 'package=' + encodeURIComponent(name) + '&purge=' + (purge ? '1' : '0') + '&removeDeps=' + (removeDeps ? '1' : '0');

				println('> POST ' + removeUrl);
				println('> body: ' + formBody);
				return self._httpJson(removeUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json', 'X-CSRF-Token': token },
					body: formBody
				}).then(function(res){
					println('< Response: ' + JSON.stringify(res));
					if (res && res.ok) {
						println(_('卸载成功'));
						enableClose();
						refresh();
						return;
					}
					println('! POST 失败或返回非成功，尝试 GET…');
					var q = L.url('admin/vum/uninstall/remove') + '?' +
						(token ? ('token=' + encodeURIComponent(token) + '&') : '') +
						('package=' + encodeURIComponent(name) + '&purge=' + (purge ? '1' : '0') + '&removeDeps=' + (removeDeps ? '1' : '0'));
					println('> GET ' + q);
					return self._httpJson(q, { method: 'GET', headers: { 'Accept': 'application/json' } }).then(function(r2){
						println('< Response: ' + JSON.stringify(r2));
						if (r2 && r2.ok) {
							println(_('卸载成功'));
							refresh();
						} else {
							println(_('卸载失败'));
						}
						enableClose();
					});
				}).catch(function(err){
					println('! Error: ' + String(err));
					enableClose();
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

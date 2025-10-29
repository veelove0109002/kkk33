// SPDX-License-Identifier: Apache-2.0
'use strict';
'require view';
'require rpc';
'require ui';

return view.extend({
	load: function() {
		return Promise.resolve();
	},


	pollList: function() {
		return L.fetch(L.url('admin/system/uninstall/list'), { headers: { 'Accept': 'application/json' } })
			.then(res => res.json());
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

		var table = E('table', { 'class': 'table' }, [
			E('tr', {}, [
				E('th', {}, _('包名')),
				E('th', {}, _('版本')),
				E('th', {}, '')
			])
		]);

		root.appendChild(table);

		function refresh() {
			self.pollList().then(data => {
				var pkgs = (data && data.packages) || [];
				var q = (document.getElementById('filter').value || '').toLowerCase();
				var tbody = E('tbody', {});
				pkgs.filter(p => !q || p.name.toLowerCase().includes(q)).forEach(p => {
					var btn = E('button', { 'class': 'btn cbi-button cbi-button-remove', click: () => uninstall(p.name) }, _('卸载'));
					tbody.appendChild(E('tr', {}, [
						E('td', {}, p.name),
						E('td', {}, p.version || ''),
						E('td', { 'style': 'text-align:right;' }, btn)
					]));
				});
				var old = table.querySelector('tbody');
				if (old) old.remove();
				table.appendChild(tbody);
			}).catch(err => {
				ui.addNotification(null, E('p', {}, _('加载软件包列表失败: ') + String(err)), 'danger');
			});
		}

		function uninstall(name) {
			var purge = document.getElementById('purge').checked;
			return ui.confirm((_('确定卸载包 %s ？').format ? _('确定卸载包 %s ？').format(name) : '确定卸载包 ' + name + ' ？'), purge ? _('同时删除配置文件。') : '').then((ok) => {
				if (!ok) return;
				ui.await(
					L.fetch(L.url('admin/system/uninstall/remove'), {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
						body: JSON.stringify({ package: name, purge: purge })
					}).then(res => res.json()).then(res => {
						if (res && res.ok) {
							ui.addNotification(null, E('p', {}, _('卸载成功')));
							refresh();
						} else {
							ui.addNotification(null, E('pre', {}, (res && res.message) || _('卸载失败')) , 'danger');
						}
					}).catch(err => {
						ui.addNotification(null, E('p', {}, _('请求失败: ') + String(err)), 'danger');
					})
				, _('执行中…'));
			});
		}

		root.addEventListener('input', function(ev) {
			if (ev.target && ev.target.id === 'filter') refresh();
		});

		refresh();
		return root;
	}
});

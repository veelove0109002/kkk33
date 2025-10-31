-- SPDX-License-Identifier: Apache-2.0

module("luci.controller.uninstall", package.seeall)

function index()
	if not nixio.fs.access('/etc/config') then
		return
	end

	entry({ 'admin', 'vum' }, firstchild(), _('VUM插件库'), 60).dependent = true
	entry({ 'admin', 'vum', 'uninstall' }, view('uninstall/main'), _('高级卸载'), 90).acl_depends = { 'luci-app-uninstall' }
	entry({ 'admin', 'vum' }, firstchild(), _('VUM插件库'), 60).icon = 'icons/vum.svg'

	local e
	e = entry({ 'admin', 'vum', 'uninstall', 'list' }, call('action_list'))
	e.leaf = true
	e.acl_depends = { 'luci-app-uninstall' }

	e = entry({ 'admin', 'vum', 'uninstall', 'remove' }, call('action_remove'))
	e.leaf = true
	e.acl_depends = { 'luci-app-uninstall' }
end

local http = require 'luci.http'
local sys = require 'luci.sys'
local ipkg = require 'luci.model.ipkg'
local json = require 'luci.jsonc'
local fs = require 'nixio.fs'

local function json_response(tbl, code)
	code = code or 200
	http.status(code, '')
	-- Avoid client/proxy caching
	http.header('Cache-Control', 'no-cache, no-store, must-revalidate')
	http.header('Pragma', 'no-cache')
	http.header('Expires', '0')
	http.prepare_content('application/json')
	http.write(json.stringify(tbl or {}))
end

function action_list()
	local pkgs = {}
	-- iStoreOS installed list (if present)
	local istore_list = {}
	if fs.stat('/etc/istoreos/installed.list') then
		local content = fs.readfile('/etc/istoreos/installed.list') or ''
		for line in content:gmatch('[^\n\r]+') do
			local n = line:match('^%s*([^%s#]+)')
			if n and #n > 0 then istore_list[n] = true end
		end
	end

	-- Prefer parsing status file directly for stability (only include installed packages)
	local function parse_status(path)
		local s = fs.readfile(path)
		if not s or #s == 0 then return end
		local name, ver, is_installed, install_time, vum_tag
		for line in s:gmatch("[^\n\r]*") do
			local n = line:match("^Package:%s*(.+)$")
			if n then
				-- starting a new record, flush previous if exists and installed
				if name and is_installed then
					local cat
					if vum_tag and (vum_tag == '1' or vum_tag == 'yes' or vum_tag == 'true') then
						cat = 'VUM插件类'
					elseif name == 'luci-app-uninstall' then
						cat = 'VUM插件类'
					elseif istore_list[name] then
						cat = 'iStoreOS插件类'
					elseif name:match('^luci%-app%-') then
						cat = '手动安装插件类'
					end
					local vp = false
					if vum_tag then
						local v = tostring(vum_tag):lower()
						vp = (v == '1' or v == 'yes' or v == 'true')
					end
					pkgs[#pkgs+1] = { name = name, version = ver or '', install_time = install_time, category = cat, vum_plugin = vp }
				end
				name, ver, is_installed, install_time, vum_tag = n, nil, false, nil, nil
			end
			local v = line:match("^Version:%s*(.+)$")
			if v then ver = v end
			local it = line:match("^Installed%-Time:%s*(%d+)$")
			if it then install_time = tonumber(it) end
			local st = line:match("^Status:%s*(.+)$")
			if st and st:match("installed") then is_installed = true end
			local vt = line:match("^[Vv][Uu][Mm]%-[Pp]lugin:%s*(.+)$")
			if vt then vum_tag = vt end
		end
		if name and is_installed then
			local cat
			if vum_tag and (vum_tag == '1' or vum_tag == 'yes' or vum_tag == 'true') then
				cat = 'VUM插件类'
			elseif name == 'luci-app-uninstall' then
				cat = 'VUM插件类'
			elseif istore_list[name] then
				cat = 'iStoreOS插件类'
			elseif name:match('^luci%-app%-') then
				cat = '手动安装插件类'
			end
			local vp = false
			if vum_tag then
				local v = tostring(vum_tag):lower()
				vp = (v == '1' or v == 'yes' or v == 'true')
			end
			pkgs[#pkgs+1] = { name = name, version = ver or '', install_time = install_time, category = cat, vum_plugin = vp }
		end
	end

	if fs.stat('/usr/lib/opkg/status') then
		parse_status('/usr/lib/opkg/status')
	elseif fs.stat('/var/lib/opkg/status') then
		parse_status('/var/lib/opkg/status')
	end

	if #pkgs == 0 then
		-- Fallback: `opkg list-installed`
		local out = sys.exec("opkg list-installed 2>/dev/null") or ''
		for line in out:gmatch("[^\n]+") do
			local n, v = line:match("^([^%s]+)%s+-%s+(.+)$")
			if n then pkgs[#pkgs+1] = { name = n, version = v or '' } end
		end
	end

	-- build installed name set and detect iStoreOS meta packages
	local installed = {}
	for _, p in ipairs(pkgs) do installed[p.name] = true end
	local meta_apps = {}
	for name,_ in pairs(installed) do
		local app = name:match('^app%-meta%-(.+)$')
		if app then meta_apps[app] = true end
	end

	-- mark whether package looks like a LuCI app, and categorize by source
	for _, p in ipairs(pkgs) do
		p.is_app = (p.name and p.name:match('^luci%-app%-')) and true or false
		if not p.category and p.is_app then
			local app = p.name:match('^luci%-app%-(.+)$')
			if app and meta_apps[app] then
				p.category = 'iStoreOS插件类'
			else
				p.category = '手动安装插件类'
			end
		end
	end
	-- sort by name
	table.sort(pkgs, function(a,b) return a.name < b.name end)
	json_response({ packages = pkgs, count = #pkgs })
end

local function collect_conffiles(pkg)
	-- Try to get files list before uninstall
	local out = sys.exec(string.format("opkg files '%s' 2>/dev/null", pkg)) or ''
	local files = {}
	for line in out:gmatch("[^\n]+") do
		if line:match('^/[^%s]+') then
			files[#files+1] = line
		end
	end
	return files
end

-- 检查包是否仍处于已安装状态
local function is_installed(pkg)
	local status_path = fs.stat('/usr/lib/opkg/status') and '/usr/lib/opkg/status' or (fs.stat('/var/lib/opkg/status') and '/var/lib/opkg/status' or nil)
	if not status_path then return false end
	local s = fs.readfile(status_path)
	if not s or #s == 0 then return false end
	local name, installed
	for line in s:gmatch("[^\n\r]*") do
		local n = line:match("^Package:%s*(.+)$")
		if n then
			-- flush previous
			if name == pkg and installed then return true end
			name, installed = n, false
		end
		local st = line:match("^Status:%s*(.+)$")
		if st and st:match('installed') then installed = true end
	end
	return (name == pkg and installed) and true or false
end

-- 收集需要一起卸载的关联/依赖包
local function collect_related_packages(pkg)
	local related = {}
	local app = pkg:match('^luci%-app%-(.+)$')
	-- whatdepends: 反向依赖者列表
	local wd = sys.exec(string.format("opkg whatdepends '%s' 2>/dev/null", pkg)) or ''
	for line in wd:gmatch("[^\n]+") do
		local name = line:match("^%s*([^%s]+)%s*$")
		if name and name ~= pkg then related[#related+1] = name end
	end
	-- 基于模式的常见关联包
	if app then
		-- 语言包
		local status_path = fs.stat('/usr/lib/opkg/status') and '/usr/lib/opkg/status' or (fs.stat('/var/lib/opkg/status') and '/var/lib/opkg/status' or nil)
		if status_path then
			local s = fs.readfile(status_path) or ''
			for name in s:gmatch('Package:%s*(luci%-i18n%-' .. app .. '%-[%w%-%_]+)') do
				related[#related+1] = name
			end
		end
		-- meta 包和本体
		related[#related+1] = 'app-meta-' .. app
		related[#related+1] = app
	end
	-- 去重
	local seen, uniq = {}, {}
	for _, n in ipairs(related) do
		if n and not seen[n] then seen[n] = true; uniq[#uniq+1] = n end
	end
	return uniq
end

local function remove_confs(files)
	local removed = {}
	for _, f in ipairs(files or {}) do
		-- only remove under /etc to be safe
		if f:sub(1,5) == '/etc/' and fs.stat(f) then
			fs.remove(f)
			removed[#removed+1] = f
		end
		-- also remove any corresponding symlinks in /etc/rc.d
		if f:sub(1,12) == '/etc/init.d/' then
			local base = f:match('/etc/init.d/(.+)$')
			if base then
				for rc in fs.dir('/etc/rc.d') or function() return nil end do end
				local d = '/etc/rc.d'
				local h = fs.dir(d)
				if h then
					for n in h do
						if n:match(base .. '$') then
							local p = d .. '/' .. n
							if fs.lstat(p) then fs.remove(p) end
						end
					end
				end
			end
		end
	end
	return removed
end

function action_remove()
	-- 优先从表单获取参数，避免读取原始内容后导致表单解析失效
	local pkg = http.formvalue('package')
	local purge = (http.formvalue('purge') == '1')
	local remove_deps = (http.formvalue('removeDeps') == '1')
	-- 若表单未提供，则尝试解析 JSON 请求体
	if (not pkg or pkg == '') then
		local body = http.content() or ''
		if body and #body > 0 then
			local ok, data = pcall(json.parse, body)
			if ok and data then
				pkg = data.package or pkg
				if data.purge ~= nil then purge = data.purge and true or false end
				if data.removeDeps ~= nil then remove_deps = data.removeDeps and true or false end
			end
		end
	end

	if not pkg or pkg == '' then
		return json_response({ ok = false, message = 'Missing package' }, 400)
	end

	local function append_log(buf, line)
		buf[#buf+1] = line
	end

	-- If uninstalling PassWall, perform thorough cleanup mirroring the provided script
	if pkg == 'luci-app-passwall' or pkg == 'passwall' then
		local log = {}
		append_log(log, '=== PassWall 卸载流程开始 ===')

		-- [1/6] 停止并禁用服务
		if fs.access('/etc/init.d/passwall') then
			append_log(log, '+ /etc/init.d/passwall stop')
			sys.call('/etc/init.d/passwall stop >/dev/null 2>&1')
			append_log(log, '+ /etc/init.d/passwall disable')
			sys.call('/etc/init.d/passwall disable >/dev/null 2>&1')
		end

		-- [2/6] 卸载包
		append_log(log, '+ opkg update')
		sys.call('opkg update >/dev/null 2>&1')
		append_log(log, '+ opkg remove luci-i18n-passwall-zh-cn')
		sys.call("opkg remove luci-i18n-passwall-zh-cn >/dev/null 2>&1")
		append_log(log, '+ opkg remove luci-app-passwall')
		sys.call("opkg remove luci-app-passwall >/dev/null 2>&1")
		append_log(log, '+ opkg autoremove')
		sys.call("opkg autoremove >/dev/null 2>&1")

		-- [3/6] 删除配置与残留文件（不可逆）
		local function rm(cmd)
			append_log(log, '+ ' .. cmd)
			sys.call(cmd .. ' >/dev/null 2>&1')
		end
		rm('rm -f /etc/config/passwall')
		rm('rm -f /usr/lib/lua/luci/controller/passwall.lua')
		rm('rm -rf /usr/lib/lua/luci/controller/passwall')
		rm('rm -rf /usr/lib/lua/luci/model/cbi/passwall')
		rm('rm -rf /usr/lib/lua/luci/view/passwall')
		rm('rm -rf /usr/share/passwall')
		rm('rm -rf /usr/share/passwall2')
		rm("rm -f /usr/bin/passwall*")
		rm("rm -f /usr/sbin/passwall*")
		rm('rm -f /etc/init.d/passwall')
		rm("find /etc/rc.d -maxdepth 1 -type l -name '*passwall*' -exec rm -f {} +")
		rm("rm -f /etc/uci-defaults/*passwall*")
		rm("find /etc/hotplug.d -type f -name '*passwall*' -exec rm -f {} +")
		rm('rm -rf /tmp/passwall* /var/run/passwall* /var/log/passwall*')

		-- [4/6] 移除可能的计划任务
		if fs.access('/etc/crontabs/root') then
			append_log(log, "+ sed -i '/passwall/d' /etc/crontabs/root")
			sys.call("sed -i '/passwall/d' /etc/crontabs/root >/dev/null 2>&1")
			append_log(log, '+ /etc/init.d/cron reload')
			sys.call('/etc/init.d/cron reload >/dev/null 2>&1')
		end

		-- [5/6] 刷新 LuCI 缓存并重载 Web/防火墙
		rm('rm -f /tmp/luci-indexcache')
		rm('rm -rf /tmp/luci-modulecache/*')
		-- luci-reload 如果可用
		sys.call('command -v luci-reload >/dev/null 2>&1 && luci-reload')
		-- 重载常见服务
		sys.call('[ -x /etc/init.d/uhttpd ] && /etc/init.d/uhttpd reload >/dev/null 2>&1')
		sys.call('[ -x /etc/init.d/nginx ] && /etc/init.d/nginx reload >/dev/null 2>&1')
		sys.call('[ -x /etc/init.d/firewall ] && /etc/init.d/firewall reload >/dev/null 2>&1')

		-- [6/6] sync
		append_log(log, '+ sync')
		sys.call('sync >/dev/null 2>&1')

		return json_response({ ok = true, message = table.concat(log, "\n") })
	end

	-- 通用卸载逻辑（保留原行为）
	local files
	if purge then
		files = collect_conffiles(pkg)
	end

	-- 尝试停止 init 脚本（兼容 luci-app- 前缀）
	local app = pkg:match('^luci%-app%-(.+)$')
	sys.call(string.format("/etc/init.d/%q stop >/dev/null 2>&1", pkg))
	if app then
		sys.call(string.format("/etc/init.d/%q stop >/dev/null 2>&1", app))
		-- 尝试卸载对应的语言包（如 luci-i18n-<app>-zh-cn 等）
		local status_path = fs.stat('/usr/lib/opkg/status') and '/usr/lib/opkg/status' or (fs.stat('/var/lib/opkg/status') and '/var/lib/opkg/status' or nil)
		if status_path then
			local s = fs.readfile(status_path) or ''
			for name in s:gmatch('Package:%s*(luci%-i18n%-' .. app .. '%-[%w%-%_]+)') do
				sys.call(string.format("opkg remove '%s' >/dev/null 2>&1", name))
			end
		end
	end

	-- 卸载包（依据退出码判断成功）
	local tmpout = '/tmp/opkg-remove-output.txt'
	local function run_remove(cmd)
		local rc = sys.call(cmd)
		local out = fs.readfile(tmpout) or ''
		return rc, out
	end
	-- 先尝试正常卸载
	local cmd = string.format("opkg remove --autoremove '%s' >%s 2>&1", pkg, tmpout)
	local rc, output = run_remove(cmd)
	local success = (rc == 0) or (not is_installed(pkg))
	-- 若提示依赖阻塞，则强制卸载（仅针对 luci-app-*）。若选择“同时卸载相关依赖”，按强制策略处理。
	if (not success) then
		local is_app = pkg:match('^luci%-app%-.+') ~= nil
		local dependent_warn = output:lower():match('dependent') or output:match('print_dependents_warning')
		if is_app and (dependent_warn or remove_deps) then
			local force_cmd = string.format("opkg remove --autoremove --force-depends --force-removal-of-dependent-packages '%s' >%s 2>&1", pkg, tmpout)
			rc, output = run_remove(force_cmd)
			success = (rc == 0) or (not is_installed(pkg))
		end
	end
	-- 若选择同时卸载依赖且目标包已卸载成功，则继续卸载关联包
	if success and remove_deps then
		local rel = collect_related_packages(pkg)
		for _, name in ipairs(rel) do
			if is_installed(name) then
				local cmd2 = string.format("opkg remove --autoremove --force-depends --force-removal-of-dependent-packages '%s' >%s 2>&1", name, tmpout)
				local rc2, out2 = run_remove(cmd2)
				output = (output or '') .. "\n[dep] " .. (out2 or '')
			end
		end
	end
	-- 自动清理未使用依赖
	sys.call('opkg autoremove >/dev/null 2>&1')

	local removed_confs = {}
	if purge then
		removed_confs = remove_confs(files)
		-- best-effort: also remove /etc/config/<pkg> if exists
		local cfg = '/etc/config/' .. pkg
		if fs.stat(cfg) then
			fs.remove(cfg)
			removed_confs[#removed_confs+1] = cfg
		end
	end

	json_response({
		ok = success,
		message = output or '',
		removed_configs = removed_confs
	})
end

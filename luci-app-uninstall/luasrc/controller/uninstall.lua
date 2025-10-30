-- SPDX-License-Identifier: Apache-2.0

module("luci.controller.uninstall", package.seeall)

function index()
	if not nixio.fs.access('/etc/config') then
		return
	end

	entry({ 'admin', 'system', 'uninstall' }, view('uninstall/main'), _('Uninstall'), 90).acl_depends = { 'luci-app-uninstall' }

	local e
	e = entry({ 'admin', 'system', 'uninstall', 'list' }, call('action_list'))
	e.leaf = true
	e.acl_depends = { 'luci-app-uninstall' }

	e = entry({ 'admin', 'system', 'uninstall', 'remove' }, call('action_remove'))
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
	local ok, list = pcall(ipkg.list_installed)
	if ok and list then
		for name, meta in pairs(list) do
			pkgs[#pkgs+1] = {
				name = name,
				version = meta and meta.Version or '',
				size = meta and meta.Size or 0
			}
		end
	end
	if #pkgs == 0 then
		-- Fallback 1: parse `opkg list-installed`
		local out = sys.exec("opkg list-installed 2>/dev/null") or ''
		for line in out:gmatch("[^\n]+") do
			local n, v = line:match("^([^%s]+)%s+-%s+(.+)$")
			if n then
				pkgs[#pkgs+1] = { name = n, version = v or '' }
			end
		end
	end
	if #pkgs == 0 then
		-- Fallback 2: parse status file directly
		local function parse_status(path)
			local s = fs.readfile(path)
			if not s or #s == 0 then return end
			local name, ver
			for line in s:gmatch("[^\n]+") do
				local n = line:match("^Package:%s*(.+)$")
				if n then name = n end
				local v = line:match("^Version:%s*(.+)$")
				if v then ver = v end
				if line == '' and name then
					pkgs[#pkgs+1] = { name = name, version = ver or '' }
					name, ver = nil, nil
				end
			end
			if name then pkgs[#pkgs+1] = { name = name, version = ver or '' } end
		end
		parse_status('/var/lib/opkg/status')
		if #pkgs == 0 then parse_status('/usr/lib/opkg/status') end
	end
	-- only keep luci-app-* packages
	local only = {}
	for _, p in ipairs(pkgs) do
		if p.name and p.name:match('^luci%-app%-') then
			only[#only+1] = p
		end
	end
	-- sort by name
	table.sort(only, function(a,b) return a.name < b.name end)
	json_response({ packages = only })
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
	local body = http.content() or ''
	local data = nil
	if body and #body > 0 then
		data = json.parse(body)
	end
	local pkg = data and data.package or http.formvalue('package')
	local purge = false
	if data and data.purge ~= nil then
		purge = data.purge and true or false
	else
		purge = http.formvalue('purge') == '1'
	end

	if not pkg or pkg == '' then
		return json_response({ ok = false, message = 'Missing package' }, 400)
	end

	local files
	if purge then
		files = collect_conffiles(pkg)
	end

	-- try stopping init script if exists
	sys.call(string.format("/etc/init.d/%q stop >/dev/null 2>&1", pkg))

	-- remove package
	local cmd = string.format("opkg remove --autoremove '%s' 2>&1", pkg)
	local output = sys.exec(cmd)
	local success = (output and not output:lower():match('not installed')) and (not output:lower():match('failed'))

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

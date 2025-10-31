# VUM-Plugin 封装标准

本文档定义在 OpenWrt/LuCI 插件的打包阶段写入统一识别标识，以便在 VUM 高级卸载界面进行来源分类与角标展示。

## 目标
- 为插件添加统一标识：`VUM-Plugin: yes`（支持 `yes`/`true`/`1`）。
- 安装后，标识进入系统的 opkg 状态文件，后端可识别并分类。
- 前端在卡片左下角显示 “VUM-Plugin” 角标。

## 标识字段
在 ipk 的 `CONTROL/control` 文件中加入一行：
```
VUM-Plugin: yes
```
可选值（大小写不敏感）：`yes`、`true`、`1`。

## 集成方式
根据你的打包流程，选择以下任意一种方式在“最终 control 文件生成之后”追加该行，避免被打包脚本覆盖。

### 方式 A：在 `Package/<pkg>/install` 阶段末尾追加
适用于常规 OpenWrt 包 Makefile：
```make
define Package/$(PKG_NAME)/install
	# ... 你的安装步骤
	$(if $(wildcard $(1)/CONTROL/control),echo "VUM-Plugin: yes" >> $(1)/CONTROL/control)
endef
```
说明：
- `$(1)` 为 ipkg 安装根目录，`$(1)/CONTROL/control` 为最终控制文件。
- 使用 `$(wildcard ...)` 保障追加时目标文件存在。

### 方式 B：在打包产物目录统一追加
适用于需要在最终 ipkg 产物目录写入的场景：
```make
# 例如在 Build/InstallDev 或打包完成后追加
postinst-hook:
	# 请替换为实际产物目录变量
	echo "VUM-Plugin: yes" >> $(PKG_BUILD_DIR)/ipkg-$(BOARD)/$(PKG_NAME)/CONTROL/control
```
说明：
- 某些构建系统会将控制文件生成在 `$(PKG_BUILD_DIR)/ipkg-$(BOARD)/$(PKG_NAME)/CONTROL/control`。
- 请根据你的实际构建目录调整路径。

### 方式 C：使用模板控制文件
如果你维护模板控制文件，直接预置该字段：
```
Package: luci-app-foo
Version: 1.0.0-1
Architecture: all
Maintainer: YourName
Depends: libc
Description: Foo LuCI app
VUM-Plugin: yes
```
确保构建脚本不会重写或删除模板中的该行。

## 兼容性与回退
- 后端解析大小写不敏感：`VUM-Plugin`、`vum-plugin` 都可识别。
- 若未写入标识：
  - `luci-app-uninstall` 将强制显示角标并归类 VUM。
  - 其他插件将依据 iStoreOS 记录或 meta 包判定归类。

## 验证步骤
1. 安装插件后，检查状态文件是否包含标识：
   - `/usr/lib/opkg/status` 或 `/var/lib/opkg/status`
   - 确认对应包条目中有：`VUM-Plugin: yes`
2. 刷新 LuCI 页面（必要时清理缓存）：
   - 高级卸载界面应在该插件卡片左下角显示 “VUM-Plugin”。
   - 插件应归入 “VUM插件类”。

## 前端与后端行为摘要
- 后端：读取 opkg 状态文件中的 `VUM-Plugin` 字段，返回 `vum_plugin: true/false`。
- 前端：当 `pkg.vum_plugin === true` 时在卡片左下角显示角标，并按分类竖向分区展示。

## 常见问题
- 角标不显示：
  - 确认控制文件写入时机在“最终控制文件生成之后”。
  - 确认状态文件中存在 `VUM-Plugin` 行，且值为 `yes/true/1`。
  - 刷新页面或重载 LuCI 缓存（例如删除 `/tmp/luci-*`）。
- 值写成其他字符串：请使用 `yes/true/1` 任意一个。

## 示例 Makefile 片段（基于 `luci.mk`）
```make
include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-foo/install
	# 正常安装步骤...
	$(call LuCI/Install/catalog,$(1))
	# 追加 VUM 标识
	$(if $(wildcard $(1)/CONTROL/control),echo "VUM-Plugin: yes" >> $(1)/CONTROL/control)
endef

# call BuildPackage
```

## 变更历史
- v1.0：初版标准，定义 `VUM-Plugin` 字段与集成方式。 

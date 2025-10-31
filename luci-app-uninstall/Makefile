# SPDX-License-Identifier: Apache-2.0
# Copyright 2025

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI - 高级卸载
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base +rpcd +opkg
PKG_LICENSE:=Apache-2.0

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-uninstall/install
	$(call LuCI/Install/catalog,$(1))
	# 追加 VUM 标识到最终控制文件
	$(if $(wildcard $(1)/CONTROL/control),echo "VUM-Plugin: yes" >> $(1)/CONTROL/control)
endef

# call BuildPackage - OpenWrt buildroot will handle this

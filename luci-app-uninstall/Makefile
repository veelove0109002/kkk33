# SPDX-License-Identifier: Apache-2.0
# Copyright 2025

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI - Uninstall Packages
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base +rpcd +opkg
PKG_LICENSE:=Apache-2.0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot will handle this

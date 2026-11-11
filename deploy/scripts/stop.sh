#!/bin/bash
set -euo pipefail
if systemctl list-unit-files | grep -q '^cofre.service'; then
  systemctl stop cofre || true
fi

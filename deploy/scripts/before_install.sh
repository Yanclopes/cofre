#!/bin/bash
# Remove a versão anterior para não sobrar arquivo antigo misturado com o novo.
set -euo pipefail
rm -rf /opt/cofre/app
install -d -o root -g cofre -m 750 /opt/cofre/app

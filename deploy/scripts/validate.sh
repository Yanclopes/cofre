#!/bin/bash
# O deploy só é considerado bom se a API responder e conseguir falar com o banco.
# Se falhar, o CodeDeploy faz rollback automático para a versão anterior.
set -uo pipefail
PORT=$(grep '^PORT=' /etc/cofre/cofre.env | cut -d= -f2)
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" | grep -q '"ok"'; then
    echo "Saudável após ${i} tentativa(s)"
    exit 0
  fi
  sleep 3
done
echo "API não ficou saudável" >&2
journalctl -u cofre --no-pager -n 50 >&2 || true
exit 1

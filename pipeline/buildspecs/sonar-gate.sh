#!/bin/bash
# Espera o SonarCloud processar a análise e decide se a pipeline segue.
#   - Bloqueia: vulnerabilidade aberta BLOCKER ou CRITICAL (mesmo critério do Semgrep: alta/crítica).
#   - Só informa: status do quality gate e security hotspots a revisar.
# O quality gate padrão (Sonar way) exige cobertura de testes em código novo; por isso ele não bloqueia aqui.
set -euo pipefail
: "${SONAR_TOKEN:?SONAR_TOKEN ausente}"

REPORT=".scannerwork/report-task.txt"
prop() { grep "^$1=" "$REPORT" | cut -d= -f2-; }
SERVER=$(prop serverUrl)
PROJECT=$(prop projectKey)
CE_TASK_URL=$(prop ceTaskUrl)

api() { curl -fsS -u "${SONAR_TOKEN}:" "$1"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# 1. Aguarda o processamento (até 5 minutos).
for _ in $(seq 1 60); do
  STATUS=$(api "$CE_TASK_URL" | json 'd["task"]["status"]')
  case "$STATUS" in
    SUCCESS) break ;;
    FAILED|CANCELED) echo "Análise no SonarCloud terminou com $STATUS"; exit 1 ;;
  esac
  sleep 5
done
[ "$STATUS" = "SUCCESS" ] || { echo "Tempo esgotado esperando o SonarCloud"; exit 1; }
ANALYSIS_ID=$(api "$CE_TASK_URL" | json 'd["task"]["analysisId"]')

# 2. Quality gate (informativo).
GATE=$(api "${SERVER}/api/qualitygates/project_status?analysisId=${ANALYSIS_ID}" | json 'd["projectStatus"]["status"]')
HOTSPOTS=$(api "${SERVER}/api/hotspots/search?projectKey=${PROJECT}&status=TO_REVIEW&ps=1" | json 'd["paging"]["total"]')
echo "Quality gate: ${GATE} | security hotspots a revisar: ${HOTSPOTS}"

# 3. Gate de segurança (bloqueante).
VULNS=$(api "${SERVER}/api/issues/search?componentKeys=${PROJECT}&types=VULNERABILITY&severities=BLOCKER,CRITICAL&resolved=false&ps=1" | json 'd["total"]')
echo "Vulnerabilidades BLOCKER/CRITICAL abertas: ${VULNS}"
echo "Detalhes: ${SERVER}/project/issues?id=${PROJECT}&types=VULNERABILITY&resolved=false"
if [ "$VULNS" -gt 0 ]; then
  echo "Pipeline bloqueada pelo SonarCloud."
  exit 1
fi

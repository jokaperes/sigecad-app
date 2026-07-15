#!/bin/zsh
# Teste de statelessness: retesta o MESMO UFGDNET a cada 60min (gap >30min = idle limpo).
# 200 sucessivos => stateless / sem timeout por inatividade. 302 => sessão server-side expirou.
set -eu
umask 077

if [[ -z "${SIGECAD_TOKEN:-}" ]]; then
  echo "Defina SIGECAD_TOKEN no ambiente; o token nunca deve ficar neste arquivo." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
URL="${IDLE_TEST_URL:-https://sigecad-academico.app.ufgd.edu.br/rest/periodosletivos}"
LOG="${IDLE_TEST_LOG:-$ROOT/IDLE-TEST.log}"
echo "# início: $(date '+%Y-%m-%d %H:%M:%S %Z') — 1 check/60min, mesmo token" >> "$LOG"
i=0
while [[ $i -lt 12 ]]; do
  sleep 3600
  i=$((i+1))
  if ! code=$(curl -sS -o /dev/null -w '%{http_code}' --compressed \
      --connect-timeout 15 --max-time 30 -b "$SIGECAD_TOKEN" "$URL"); then
    code="network-error"
  fi
  gap_min=$((i*60))
  echo "check $i | +${gap_min}min idle | $(date '+%H:%M:%S') | status=$code" >> "$LOG"
done
echo "# fim: $(date '+%H:%M:%S %Z')" >> "$LOG"

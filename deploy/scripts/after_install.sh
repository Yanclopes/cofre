#!/bin/bash
# Instala o serviço systemd com isolamento: usuário sem shell, sistema de arquivos só leitura.
set -euo pipefail

cat > /etc/systemd/system/cofre.service <<'EOF'
[Unit]
Description=Cofre API (NestJS)
After=network-online.target
Wants=network-online.target

[Service]
User=cofre
Group=cofre
EnvironmentFile=/etc/cofre/cofre.env
WorkingDirectory=/opt/cofre/app/backend
ExecStart=/opt/node/bin/node dist/main.js
Restart=on-failure
RestartSec=3
StandardOutput=append:/var/log/cofre/app.log
StandardError=append:/var/log/cofre/app.log

# Endurecimento
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
ReadWritePaths=/var/log/cofre

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cofre

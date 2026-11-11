#!/bin/bash
# Instala a versão fixada do Terraform, conferindo o SHA-256 publicado pela HashiCorp.
set -euo pipefail
VERSION="${TF_VERSION:?defina TF_VERSION}"
cd /tmp
curl -fsSLO "https://releases.hashicorp.com/terraform/${VERSION}/terraform_${VERSION}_linux_amd64.zip"
curl -fsSLO "https://releases.hashicorp.com/terraform/${VERSION}/terraform_${VERSION}_SHA256SUMS"
grep "terraform_${VERSION}_linux_amd64.zip" "terraform_${VERSION}_SHA256SUMS" | sha256sum -c -
unzip -o -q "terraform_${VERSION}_linux_amd64.zip" -d /usr/local/bin
terraform version

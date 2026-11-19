#!/bin/bash
# Instala a versão fixada do SonarScanner CLI (traz a própria JRE), conferindo o SHA-256.
set -euo pipefail
VERSION="7.2.0.5079"
SHA256="da9f4e64a3d555f08ce38b5469ebd91fe2b311af473f7001a5ee5c1fd58b004b"
ZIP="sonar-scanner-cli-${VERSION}-linux-x64.zip"
cd /tmp
curl -fsSLO "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/${ZIP}"
echo "${SHA256}  ${ZIP}" | sha256sum -c -
unzip -o -q "${ZIP}" -d /opt
ln -sf "/opt/sonar-scanner-${VERSION}-linux-x64/bin/sonar-scanner" /usr/local/bin/sonar-scanner
sonar-scanner --version

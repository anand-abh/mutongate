# Sourced via BASH_ENV before Harbor's bash -c agent command.
# Do not print — keep silent.
#
# Harbor also sources BASH_ENV for root setup (apt/nvm). Creating
# $PI_CODING_AGENT_DIR as root leaves it mode 755 root:root, and pi then
# fails with EACCES on auth.json when the agent user runs. Skip as root.
if [ "$(id -u)" -eq 0 ]; then
  return 0 2>/dev/null || exit 0
fi
DIR="${PI_CODING_AGENT_DIR:-/tmp/pi-muton}"
mkdir -p "$DIR/extensions"
# Belt-and-suspenders if a prior root shell already created the dir.
chmod u+rwx "$DIR" "$DIR/extensions" 2>/dev/null || true
if [ -f /opt/muton/muton.ts ]; then
  cp -f /opt/muton/muton.ts "$DIR/extensions/muton.ts" 2>/dev/null || true
fi

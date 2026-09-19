# Sourced via BASH_ENV before Harbor's bash -c agent command.
# Do not print — keep silent.
DIR="${PI_CODING_AGENT_DIR:-/tmp/pi-muton}"
mkdir -p "$DIR/extensions"
if [ -f /opt/muton/muton.ts ]; then
  cp -f /opt/muton/muton.ts "$DIR/extensions/muton.ts" 2>/dev/null || true
fi

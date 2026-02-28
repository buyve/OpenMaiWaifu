#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
#  AI Desktop Companion — Install & Setup Script
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/buyve/OpenMaiWaifu/main/scripts/install.sh | bash
#
#  What it does:
#    1. Download the latest release for your platform
#    2. Install the app (/Applications on macOS)
#    3. Interactive CLI setup (name, OpenClaw agent)
#    4. Write firstrun.json so the app skips FTUE
# ──────────────────────────────────────────────────────────
set -eo pipefail

REPO="buyve/OpenMaiWaifu"
APP_NAME="AI Desktop Companion"
DATA_DIR="${HOME}/Library/Application Support/ai-desktop-companion"
CONFIG_DIR="${HOME}/Library/Application Support/ai-desktop-companion"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ──

info()  { printf "${CYAN}▸${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
err()   { printf "${RED}✗${RESET} %s\n" "$*" >&2; }
ask()   { printf "${BOLD}${CYAN}?${RESET}${BOLD} %s${RESET} " "$*"; }
# Read from terminal even when piped via curl
prompt() { read -r "$@" </dev/tty; }

banner() {
  echo ""
  printf "${BOLD}${CYAN}"
  cat << 'EOF'
    ╔═══════════════════════════════════════╗
    ║   AI Desktop Companion  — Installer   ║
    ╚═══════════════════════════════════════╝
EOF
  printf "${RESET}"
  echo ""
}

# ── Step 1: Platform Detection ──

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64)  echo "darwin-aarch64" ;;
        x86_64) echo "darwin-x86_64" ;;
        *)      err "Unsupported macOS architecture: $arch"; exit 1 ;;
      esac
      ;;
    *)
      err "This installer currently supports macOS only."
      err "For Windows, download the .msi from: https://github.com/$REPO/releases"
      exit 1
      ;;
  esac
}

# ── Step 2: Download & Install ──

download_and_install() {
  local platform="$1"

  info "Fetching latest release..."
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*: *"//;s/".*//')

  if [ -z "$tag" ]; then
    err "Could not find latest release. Check https://github.com/$REPO/releases"
    exit 1
  fi
  ok "Latest version: $tag"

  local filename="AI-Desktop-Companion_${tag}_${platform}.tar.gz"
  local url="https://github.com/$REPO/releases/download/${tag}/${filename}"

  local tmpdir
  tmpdir=$(mktemp -d)
  # Clean up temp dir when function exits — use subshell-safe approach
  _INSTALL_TMPDIR="$tmpdir"

  info "Downloading ${filename}..."
  if ! curl -fSL --progress-bar -o "$tmpdir/$filename" "$url"; then
    err "Download failed. URL: $url"
    exit 1
  fi
  ok "Downloaded successfully"

  info "Extracting..."
  tar -xzf "$tmpdir/$filename" -C "$tmpdir"

  # Find the .app bundle
  local app_path
  app_path=$(find "$tmpdir" -name "*.app" -maxdepth 2 | head -1)

  if [ -z "$app_path" ]; then
    err "Could not find .app bundle in archive"
    exit 1
  fi

  # Install to /Applications
  local dest="/Applications/${APP_NAME}.app"
  if [ -d "$dest" ]; then
    warn "Existing installation found. Replacing..."
    rm -rf "$dest"
  fi

  info "Installing to /Applications..."
  cp -R "$app_path" "$dest"
  ok "Installed: $dest"

  # Remove quarantine attribute
  xattr -cr "$dest" 2>/dev/null || true
}

# ── Step 3: Interactive Setup ──

setup_wizard() {
  echo ""
  printf "${BOLD}── Setup ──${RESET}\n"
  echo ""

  # 3a. Ask for user name
  local user_name=""
  while [ -z "$user_name" ]; do
    ask "이름이 뭐야? (What's your name?):"
    prompt user_name
    user_name=$(echo "$user_name" | xargs)  # trim whitespace
  done
  ok "안녕 ${user_name}!"

  # 3b. Check OpenClaw CLI
  echo ""
  info "Checking OpenClaw CLI..."

  local openclaw_cmd="openclaw"
  local openclaw_installed=false

  # Check common paths
  for path in "$HOME/.openclaw/bin/openclaw" "/usr/local/bin/openclaw" "$(which openclaw 2>/dev/null || true)"; do
    if [ -n "$path" ] && [ -x "$path" ]; then
      openclaw_cmd="$path"
      openclaw_installed=true
      break
    fi
  done

  local agent_id=""
  local setup_openclaw=false

  if $openclaw_installed; then
    local version
    version=$("$openclaw_cmd" --version 2>/dev/null || echo "unknown")
    ok "OpenClaw found: $version"

    # Check if gateway is running
    local gateway_running=false
    if "$openclaw_cmd" health 2>/dev/null | grep -qi "ok\|healthy\|running"; then
      gateway_running=true
      ok "OpenClaw gateway is running"
    elif curl -sf http://localhost:18789/health >/dev/null 2>&1; then
      gateway_running=true
      ok "OpenClaw gateway is running"
    else
      warn "OpenClaw gateway is not running"
      info "Start it with: openclaw daemon start"
    fi

    if $gateway_running; then
      # List existing agents
      local agents_json
      agents_json=$("$openclaw_cmd" agents list --json 2>/dev/null || echo "[]")
      local agent_count
      agent_count=$(echo "$agents_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

      echo ""
      if [ "$agent_count" -gt "0" ]; then
        # Build agent names array
        local agent_names
        agent_names=$(echo "$agents_json" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    print(a.get('name', a.get('id', 'unknown')))
" 2>/dev/null)

        info "Found $agent_count existing agent(s):"
        local idx=1
        while IFS= read -r name; do
          echo "  ${idx}) ${name}"
          idx=$((idx + 1))
        done <<< "$agent_names"

        echo ""
        ask "Select agent number (or type a name to create new) [1]:"
        local choice
        prompt choice
        choice=${choice:-1}

        # If numeric, pick from list
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$agent_count" ]; then
          agent_id=$(echo "$agent_names" | sed -n "${choice}p")
          ok "Selected agent: $agent_id"
        elif [ -n "$choice" ]; then
          # Treat as new agent name — create with workspace
          local new_name="$choice"
          local workspace="$HOME/.openclaw/workspace-${new_name}"
          info "Creating new agent: ${new_name}..."
          if "$openclaw_cmd" agents add "$new_name" --workspace "$workspace" --non-interactive 2>&1; then
            agent_id="$new_name"
            ok "Agent created: $agent_id (workspace: $workspace)"
          else
            warn "Agent creation failed."
            ask "Enter an existing agent name instead (or press Enter to skip):"
            prompt agent_id
            agent_id=$(echo "$agent_id" | xargs)
          fi
        fi
      else
        # No agents exist — create one
        local new_name="desktop-companion"
        local workspace="$HOME/.openclaw/workspace-${new_name}"
        info "No agents found. Creating '${new_name}'..."
        if "$openclaw_cmd" agents add "$new_name" --workspace "$workspace" --non-interactive 2>&1; then
          agent_id="$new_name"
          ok "Agent created: $agent_id"
        else
          warn "Agent creation failed."
          ask "Enter agent name manually (or press Enter to skip):"
          prompt agent_id
          agent_id=$(echo "$agent_id" | xargs)
        fi
      fi

      # Setup hooks
      if [ -n "$agent_id" ]; then
        info "Setting up hooks..."
        "$openclaw_cmd" hooks setup 2>/dev/null && ok "Hooks configured" || warn "Hooks setup skipped"
      fi

      setup_openclaw=true
    fi
  else
    warn "OpenClaw CLI not found."
    echo ""
    printf "  ${DIM}Install it from: https://github.com/openclaw/openclaw${RESET}\n"
    printf "  ${DIM}You can set it up later in the app's Settings.${RESET}\n"
    echo ""
  fi

  # ── Step 4: Write firstrun.json ──

  echo ""
  info "Saving configuration..."

  mkdir -p "$DATA_DIR"
  mkdir -p "$CONFIG_DIR"

  # Write firstrun.json for the app to consume
  cat > "$DATA_DIR/firstrun.json" << JSONEOF
{
  "userName": $(python3 -c "import json; print(json.dumps('$user_name'))" 2>/dev/null || echo "\"$user_name\""),
  "screenWatchEnabled": true,
  "commentFrequency": "medium",
  "ftueComplete": true
}
JSONEOF
  ok "First-run settings saved"

  # Write OpenClaw config if we set it up
  if $setup_openclaw && [ -n "$agent_id" ]; then
    cat > "$CONFIG_DIR/config.json" << JSONEOF
{
  "gatewayUrl": "http://localhost:18789",
  "agentId": $(python3 -c "import json; print(json.dumps('$agent_id'))" 2>/dev/null || echo "\"$agent_id\""),
  "hooksToken": "",
  "sessionKey": "",
  "cliPath": "$openclaw_cmd"
}
JSONEOF
    ok "OpenClaw config saved"

    # Introduce user to the agent so it remembers the name
    info "Introducing you to the agent..."
    local intro_response
    intro_response=$("$openclaw_cmd" agent --agent "$agent_id" --message "안녕! 내 이름은 ${user_name}이야. 앞으로 나를 ${user_name}이라고 불러줘. 반말로 편하게 대화하자!" 2>&1) && {
      ok "Agent knows your name now!"
      echo ""
      printf "  ${DIM}%s${RESET}\n" "$(echo "$intro_response" | head -3)"
      local line_count
      line_count=$(echo "$intro_response" | wc -l | xargs)
      if [ "$line_count" -gt 3 ]; then
        printf "  ${DIM}...${RESET}\n"
      fi
    } || warn "Could not introduce you to the agent (you can chat later)"
  fi

  # ── Done ──

  echo ""
  printf "${BOLD}${GREEN}"
  cat << 'EOF'
    ╔═══════════════════════════════════════╗
    ║          ✓  Setup Complete!           ║
    ╚═══════════════════════════════════════╝
EOF
  printf "${RESET}"
  echo ""

  if [ -n "$agent_id" ]; then
    ok "Name: $user_name"
    ok "Agent: $agent_id"
  else
    ok "Name: $user_name"
    warn "OpenClaw: not configured (set up later in Settings)"
  fi

  echo ""
  ask "Launch the app now? [Y/n]:"
  local launch
  prompt launch
  launch=${launch:-Y}

  if [[ "$launch" =~ ^[Yy] ]]; then
    info "Launching ${APP_NAME}..."
    open "/Applications/${APP_NAME}.app"
  else
    info "You can launch it anytime from /Applications or Spotlight."
  fi

  echo ""
  ok "Done! Enjoy your AI companion 🎉"
  echo ""
}

# ── Cleanup ──

_INSTALL_TMPDIR=""
cleanup() { [ -n "$_INSTALL_TMPDIR" ] && rm -rf "$_INSTALL_TMPDIR"; }
trap cleanup EXIT

# ── Main ──

main() {
  banner

  local platform
  platform=$(detect_platform)
  info "Detected platform: $platform"
  echo ""

  download_and_install "$platform"
  setup_wizard
}

main "$@"

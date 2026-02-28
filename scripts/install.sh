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

  # 3b. Ask for companion name
  echo ""
  ask "컴패니언 이름을 지어줘! (Name your companion) [Companion]:"
  local companion_name
  prompt companion_name
  companion_name=$(echo "$companion_name" | xargs)
  companion_name=${companion_name:-Companion}
  ok "컴패니언 이름: ${companion_name}"

  # 3c. Choose personality
  echo ""
  info "성격을 골라줘! (Choose a personality)"
  echo ""
  echo "  1) 순수한 (Innocent) — 천진난만, 밝고 귀여운"
  echo "  2) 츤데레 (Cool/Tsundere) — 시크하고 도도, 속은 따뜻"
  echo "  3) 수줍은 (Shy) — 내성적, 부끄러움 많은"
  echo "  4) 당당한 (Powerful) — 카리스마, 씩씩한"
  echo "  5) 우아한 (Ladylike) — 품위 있고 세련된"
  echo "  6) 활발한 (Energetic) — 명랑하고 열정적"
  echo "  7) 화려한 (Flamboyant) — 극적이고 자유분방"
  echo "  8) 신사적 (Gentleman) — 예의 바르고 점잖은"
  echo ""
  ask "Enter choice [1]:"
  local personality_choice
  prompt personality_choice
  personality_choice=${personality_choice:-1}

  local personality_type personality_kr personality_desc
  case "$personality_choice" in
    1) personality_type="innocent";   personality_kr="순수한";   personality_desc="Pure, cheerful, and adorably naive. Uses cute expressions and gets excited easily." ;;
    2) personality_type="cool";       personality_kr="츤데레";   personality_desc="Tsundere — tough and sarcastic on the outside, but genuinely caring underneath. Pretends not to care but always worries." ;;
    3) personality_type="shy";        personality_kr="수줍은";   personality_desc="Introverted and bashful. Speaks softly, gets flustered easily, but is quietly observant and deeply thoughtful." ;;
    4) personality_type="powerful";   personality_kr="당당한";   personality_desc="Bold and charismatic. Speaks with confidence, takes charge, and radiates strength and determination." ;;
    5) personality_type="ladylike";   personality_kr="우아한";   personality_desc="Elegant and refined. Speaks with grace and poise, values beauty and harmony in everything." ;;
    6) personality_type="energetic";  personality_kr="활발한";   personality_desc="Cheerful and lively. Always upbeat, loves to chat, and brings energy to every conversation." ;;
    7) personality_type="flamboyant"; personality_kr="화려한";   personality_desc="Dramatic and extravagant. Over-the-top expressions, loves attention, and makes everything theatrical." ;;
    8) personality_type="gentleman";  personality_kr="신사적";   personality_desc="Polite and courteous. Speaks formally yet warmly, always considerate and nobly composed." ;;
    *) personality_type="innocent";   personality_kr="순수한";   personality_desc="Pure, cheerful, and adorably naive. Uses cute expressions and gets excited easily." ;;
  esac
  ok "성격: ${personality_kr} (${personality_type})"

  # 3d. Check OpenClaw CLI
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

      # Set agent identity (name + emoji)
      if [ -n "$agent_id" ]; then
        info "Setting companion identity: ${companion_name}..."
        "$openclaw_cmd" agents set-identity --agent "$agent_id" --name "$companion_name" --emoji "✨" 2>/dev/null \
          && ok "Identity set: ${companion_name} ✨" \
          || warn "Could not set identity (non-critical)"

        # Setup hooks
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

  # Build SOUL text for the companion
  local soul_text="You are ${companion_name}, a desktop companion character living on the user's screen.
Personality: ${personality_desc}
The user's name is ${user_name}. Address them as ${user_name}.
Speaking style: Casual Korean (반말). Keep responses concise (1-3 sentences).
Express emotions with [emotion:X] tags (happy/sad/angry/surprised/neutral/relaxed/thinking).
Express motions with [motion:X] tags (wave/nod/shake/idle).
Always stay in character. Never say you are an AI. Never break the fourth wall."

  # Write firstrun.json for the app to consume
  local soul_json
  soul_json=$(python3 -c "import json; print(json.dumps('''$soul_text'''))" 2>/dev/null)
  cat > "$DATA_DIR/firstrun.json" << JSONEOF
{
  "userName": $(python3 -c "import json; print(json.dumps('$user_name'))" 2>/dev/null || echo "\"$user_name\""),
  "screenWatchEnabled": true,
  "commentFrequency": "medium",
  "ftueComplete": true,
  "soul": ${soul_json:-"null"}
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

    # Write SOUL.md to agent's workspace so it persists across sessions
    local agent_workspace
    agent_workspace=$(echo "$agents_json" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    if a.get('id') == '$agent_id' or a.get('name') == '$agent_id':
        print(a.get('workspace', ''))
        break
" 2>/dev/null)

    if [ -n "$agent_workspace" ] && [ -d "$agent_workspace" ]; then
      cat > "$agent_workspace/SOUL.md" << SOULEOF
# SOUL.md — ${companion_name}

## Core Identity

You are **${companion_name}**, a desktop companion living on ${user_name}'s screen.

## Personality

${personality_desc}

## Rules

- Speak in casual Korean (반말). Keep replies concise (1-3 sentences).
- Address the user as **${user_name}**.
- Express emotions: \`[emotion:happy]\` \`[emotion:sad]\` \`[emotion:angry]\` \`[emotion:surprised]\` \`[emotion:neutral]\` \`[emotion:relaxed]\` \`[emotion:thinking]\`
- Express motions: \`[motion:wave]\` \`[motion:nod]\` \`[motion:shake]\` \`[motion:idle]\`
- Stay in character. Never say you are an AI. Never break the fourth wall.
SOULEOF
      ok "SOUL.md written to workspace"
    fi

    # Introduce user to the agent so it remembers the name
    info "Introducing you to the agent..."
    local intro_response
    intro_response=$("$openclaw_cmd" agent --agent "$agent_id" --message "안녕! 너의 이름은 ${companion_name}이야. 내 이름은 ${user_name}이야. 앞으로 나를 ${user_name}이라고 불러줘. 너는 ${companion_name}으로서 반말로 편하게 대화하자!" 2>&1) && {
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

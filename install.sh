#!/usr/bin/env bash
# OpenMaiWaifu — One-liner Install Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/buyve/openmaiwaifu/main/install.sh | bash
#
# Non-interactive (CI):
#   AI_COMPANION_NONINTERACTIVE=1 \
#   AI_COMPANION_NAME="Bot" \
#   AI_COMPANION_AGENT="claire" \
#     bash install.sh

set -euo pipefail

# ---------- Constants ----------

REPO="buyve/openmaiwaifu"
APP_NAME="OpenMaiWaifu"
INSTALL_DIR="/Applications"
BINARY_PREFIX="AI-Desktop-Companion"

# Colors (disabled when piped / non-TTY)
if [ -t 1 ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  RED="\033[31m"
  CYAN="\033[36m"
  RESET="\033[0m"
else
  BOLD="" DIM="" GREEN="" YELLOW="" RED="" CYAN="" RESET=""
fi

# ---------- Helpers ----------

info()  { printf "${GREEN}[✓]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${RESET} %s\n" "$*"; }
error() { printf "${RED}[✗]${RESET} %s\n" "$*" >&2; }
step()  { printf "\n${BOLD}${CYAN}→ %s${RESET}\n" "$*"; }

cleanup() {
  if [ -n "${TMPDIR_CREATED:-}" ] && [ -d "${TMPDIR_CREATED}" ]; then
    rm -rf "${TMPDIR_CREATED}"
  fi
}
trap cleanup EXIT

die() {
  error "$@"
  exit 1
}

# ---------- Requirements ----------

check_requirements() {
  step "Checking requirements"

  if [ "$(id -u)" -eq 0 ]; then
    die "Do not run this script as root. It installs to ${INSTALL_DIR} without sudo on macOS."
  fi

  command -v curl >/dev/null 2>&1 || die "curl is required but not found."
  info "curl found"

  # macOS-only for now
  if [ "$(uname -s)" != "Darwin" ]; then
    die "This installer currently supports macOS only. Linux/Windows support coming soon."
  fi
  info "macOS detected"
}

# ---------- Platform Detection ----------

detect_platform() {
  step "Detecting platform"

  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin) PLATFORM="darwin" ;;
    Linux)  PLATFORM="linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *) die "Unsupported OS: $OS" ;;
  esac

  case "$ARCH" in
    arm64|aarch64) ARCH_TAG="aarch64" ;;
    x86_64|amd64)  ARCH_TAG="x86_64" ;;
    *) die "Unsupported architecture: $ARCH" ;;
  esac

  info "Platform: ${PLATFORM}-${ARCH_TAG}"
}

# ---------- Download ----------

download_release() {
  step "Downloading latest release"

  local api_url="https://api.github.com/repos/${REPO}/releases/latest"
  local pattern="${BINARY_PREFIX}.*${PLATFORM}-${ARCH_TAG}.*\\.tar\\.gz"

  info "Fetching release info from ${REPO}..."

  local release_json
  release_json="$(curl -fsSL --retry 3 "$api_url")" || die "Failed to fetch release info. Check your internet connection."

  DOWNLOAD_URL="$(echo "$release_json" \
    | grep "browser_download_url" \
    | grep -E "$pattern" \
    | head -1 \
    | sed 's/.*"\(https[^"]*\)".*/\1/')"

  if [ -z "$DOWNLOAD_URL" ]; then
    die "No release artifact found for ${PLATFORM}-${ARCH_TAG}. Please check ${REPO}/releases."
  fi

  # Extract version from URL
  VERSION="$(echo "$DOWNLOAD_URL" | sed -E 's/.*_v([0-9]+\.[0-9]+\.[0-9]+).*/\1/' || echo "unknown")"
  info "Found v${VERSION}: $(basename "$DOWNLOAD_URL")"

  TMPDIR_CREATED="$(mktemp -d)"
  local archive="${TMPDIR_CREATED}/app.tar.gz"

  info "Downloading..."
  curl -fSL --retry 3 --progress-bar -o "$archive" "$DOWNLOAD_URL" || die "Download failed."
  info "Download complete"

  info "Extracting..."
  tar -xzf "$archive" -C "${TMPDIR_CREATED}" || die "Extraction failed."
  info "Extraction complete"
}

# ---------- Install ----------

install_app() {
  step "Installing application"

  local app_bundle
  app_bundle="$(find "${TMPDIR_CREATED}" -maxdepth 2 -name "*.app" -type d | head -1)"

  if [ -z "$app_bundle" ]; then
    die "Could not find .app bundle in downloaded archive."
  fi

  local dest="${INSTALL_DIR}/${APP_NAME}.app"

  if [ -d "$dest" ]; then
    warn "Existing installation found. Replacing..."
    rm -rf "$dest"
  fi

  cp -R "$app_bundle" "$dest" || die "Failed to copy app to ${INSTALL_DIR}."

  # Clear macOS Gatekeeper quarantine attribute
  xattr -cr "$dest" 2>/dev/null || true

  info "Installed to ${dest}"
}

# ---------- TUI Wizard ----------

# Read from /dev/tty to support piped execution (curl ... | bash)
prompt() {
  local var_name="$1"
  local prompt_text="$2"
  local default="${3:-}"
  local result

  if [ -n "${AI_COMPANION_NONINTERACTIVE:-}" ]; then
    result="$default"
  else
    if [ -n "$default" ]; then
      printf "${BOLD}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt_text" "$default" > /dev/tty
    else
      printf "${BOLD}%s${RESET}: " "$prompt_text" > /dev/tty
    fi
    read -r result < /dev/tty || true
    result="${result:-$default}"
  fi

  eval "$var_name=\"\$result\""
}

prompt_yesno() {
  local var_name="$1"
  local prompt_text="$2"
  local default="${3:-y}"
  local result

  if [ -n "${AI_COMPANION_NONINTERACTIVE:-}" ]; then
    result="$default"
  else
    local hint
    if [ "$default" = "y" ]; then hint="Y/n"; else hint="y/N"; fi
    printf "${BOLD}%s${RESET} [%s]: " "$prompt_text" "$hint" > /dev/tty
    read -r result < /dev/tty || true
    result="${result:-$default}"
  fi

  case "$result" in
    [yY]*) eval "$var_name=true" ;;
    *)     eval "$var_name=false" ;;
  esac
}

run_setup_wizard() {
  step "Setup Wizard"
  printf "${DIM}Configure your OpenMaiWaifu. Press Enter to accept defaults.${RESET}\n\n"

  # --- Name ---
  prompt_name

  # --- OpenClaw ---
  prompt_openclaw

  # --- Privacy ---
  prompt_privacy
}

prompt_name() {
  printf "${CYAN}1/3 — Your Name${RESET}\n"
  prompt USER_NAME "What should I call you?" "${AI_COMPANION_NAME:-}"

  if [ -z "$USER_NAME" ]; then
    USER_NAME="User"
    warn "No name entered, using '${USER_NAME}'"
  fi
  info "Name: ${USER_NAME}"
  echo
}

prompt_openclaw() {
  printf "${CYAN}2/3 — OpenClaw Connection${RESET}\n"
  printf "${DIM}Connect to an OpenClaw agent for AI chat. Press Enter to skip.${RESET}\n"

  prompt GATEWAY_URL "Gateway URL" "${AI_COMPANION_GATEWAY:-https://gateway.openclaw.com}"
  prompt AGENT_ID "Agent ID" "${AI_COMPANION_AGENT:-}"

  if [ -n "$AGENT_ID" ]; then
    info "Agent: ${AGENT_ID} @ ${GATEWAY_URL}"
  else
    warn "No Agent ID — chat will be unavailable until configured in Settings."
  fi
  echo
}

prompt_privacy() {
  printf "${CYAN}3/3 — Privacy & Behavior${RESET}\n"

  prompt_yesno SCREEN_WATCH_ENABLED "Enable Screen Awareness? (companion observes active window)" "${AI_COMPANION_SCREEN_WATCH:-y}"

  COMMENT_FREQUENCY="${AI_COMPANION_COMMENT_FREQ:-medium}"
  if [ -z "${AI_COMPANION_NONINTERACTIVE:-}" ]; then
    printf "${BOLD}Comment frequency${RESET} ${DIM}[off/low/medium/high]${RESET} [medium]: " > /dev/tty
    read -r COMMENT_FREQUENCY < /dev/tty || true
    COMMENT_FREQUENCY="${COMMENT_FREQUENCY:-medium}"
  fi

  # Validate
  case "$COMMENT_FREQUENCY" in
    off|low|medium|high) ;;
    *) COMMENT_FREQUENCY="medium"; warn "Invalid frequency, using 'medium'" ;;
  esac

  info "Screen Awareness: ${SCREEN_WATCH_ENABLED}"
  info "Comment Frequency: ${COMMENT_FREQUENCY}"
  echo
}

# ---------- Config Writing ----------

write_config() {
  step "Writing configuration"

  case "$(uname -s)" in
    Darwin) CONFIG_DIR="$HOME/Library/Application Support/ai-desktop-companion" ;;
    *)      CONFIG_DIR="$HOME/.config/ai-desktop-companion" ;;
  esac

  mkdir -p "$CONFIG_DIR"

  # Generate random session key
  SESSION_KEY="desktop-companion-$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 8 || true)"

  # config.json — OpenClaw settings (matches Rust config.rs)
  cat > "${CONFIG_DIR}/config.json" <<CONFIGEOF
{
  "gatewayUrl": "${GATEWAY_URL}",
  "agentId": "${AGENT_ID}",
  "hooksToken": "",
  "sessionKey": "${SESSION_KEY}",
  "cliPath": "openclaw"
}
CONFIGEOF
  info "Wrote config.json"

  # firstrun.json — read by the app on first launch, then deleted
  cat > "${CONFIG_DIR}/firstrun.json" <<FIRSTRUNEOF
{
  "userName": "${USER_NAME}",
  "screenWatchEnabled": ${SCREEN_WATCH_ENABLED},
  "commentFrequency": "${COMMENT_FREQUENCY}",
  "ftueComplete": true
}
FIRSTRUNEOF
  info "Wrote firstrun.json"
}

# ---------- Launch ----------

launch_app() {
  step "Launching ${APP_NAME}"
  open -a "${APP_NAME}" 2>/dev/null || open "${INSTALL_DIR}/${APP_NAME}.app" || true
  info "App launched!"
}

# ---------- Main ----------

main() {
  printf "\n${BOLD}${CYAN}╭────────────────────────────────────╮${RESET}\n"
  printf "${BOLD}${CYAN}│   OpenMaiWaifu Installer   │${RESET}\n"
  printf "${BOLD}${CYAN}╰────────────────────────────────────╯${RESET}\n\n"

  check_requirements
  detect_platform
  download_release
  install_app
  run_setup_wizard
  write_config
  launch_app

  printf "\n${GREEN}${BOLD}✨ Installation complete!${RESET}\n"
  printf "${DIM}Configure in-app: click the ⚙ button or use the tray menu.${RESET}\n\n"
}

main "$@"

# LLM Integration Strategy

## Current Architecture

```
ClawMate App → OpenClaw CLI (subprocess) → Gateway → LLM API
```

- `send_chat` calls `openclaw agent --agent {id} --message "..."` synchronously
- Config stored at `~/.config/ai-desktop-companion/config.json`
- Character persona managed via OpenClaw agent workspace (`SOUL.md`)

## Target User: OpenClaw Users

For v0.1, target users who already have OpenClaw installed and running.

These users already have:
- ✅ openclaw installed
- ✅ gateway running (localhost:18789)
- ✅ LLM API key configured

What the app needs to do:
1. Settings에서 Agent ID 입력 (or auto-create)
2. CLI path auto-detected via `which openclaw`
3. Gateway URL defaults to `localhost:18789`
4. Done — install app → run → chat immediately

No bundling needed. Minimal setup friction.

## Future: Approach A — OpenClaw Bundling

Bundle OpenClaw inside the app so non-OpenClaw users can use it too.

```
Install app → Run → Everything works (zero config except API key)
```

### How
- Bundle OpenClaw as a Tauri sidecar binary
- Auto-start gateway on app launch
- Auto-create agent on first run
- Settings: user enters API key only

### "Downsides" (debunked)
| Claimed downside | Reality |
|---|---|
| App size ~100MB+ | Discord 500MB, Slack 300MB. Nobody cares on desktop. |
| OpenClaw update/version management | Pin version in bundle. App update = OpenClaw update. Same as Electron bundling Chromium. |
| User needs API key | Same for any approach. No difference. |
| npm package bundling hard | Tauri sidecar pattern solves this. Already proven. |

### Real advantages of A
- Memory, skills, conversation history — free from OpenClaw
- SOUL.md persona management — no custom implementation needed
- Future multi-channel (Telegram, Discord) — just config
- Multi-character — just add agents

## Future: Approach B — Direct LLM API

Remove OpenClaw dependency. App calls LLM APIs directly.

- Simpler, smaller app
- User enters API key in Settings
- Must implement persona, history, context management in-app
- Good for widening user base later

## Future: Approach C — Hybrid

Default B (API key), optional OpenClaw integration for power users.

- Covers both audiences
- Most dev effort (two code paths)
- Best as eventual target after B and A are proven

## Decision

**v0.1: OpenClaw users only** (current state, minimal work)
**v0.2+: Consider A** (bundling for broader reach)
**Later: B or C** if needed for non-OpenClaw users

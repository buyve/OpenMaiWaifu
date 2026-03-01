<h1 align="center">
  OpenMaiWaifu
</h1>

<p align="center">
  <strong>AI Desktop Companion with Memory, Personality & Emotions</strong>
</p>

<p align="center">
  <a href="https://github.com/buyve/OpenMaiWaifu/releases"><img src="https://img.shields.io/github/v/release/buyve/OpenMaiWaifu?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/buyve/OpenMaiWaifu/actions"><img src="https://img.shields.io/github/actions/workflow/status/buyve/OpenMaiWaifu/release.yml?style=flat-square&label=build" alt="Build"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/buyve/OpenMaiWaifu?style=flat-square" alt="License"></a>
  <a href="https://github.com/buyve/OpenMaiWaifu/stargazers"><img src="https://img.shields.io/github/stars/buyve/OpenMaiWaifu?style=flat-square" alt="Stars"></a>
</p>

<p align="center">
  A VRM character that lives on your desktop — reacts to what you do, remembers your conversations, and develops its own personality over time. Powered by <a href="https://github.com/openclaw/openclaw">OpenClaw</a>.
</p>

---

## Highlights

- **Always-on-top VRM Character** — Transparent overlay with physics-based movement on your taskbar and windows
- **Inside Out-Inspired Memory** — Four-tier memory system (M30 → M90 → M365 → M0) with emotion tagging, promotion, and forgetting
- **Personality Islands & Sense of Self** — Core memories form personality islands; beliefs evolve with user interaction
- **Screen-Aware Comments** — Watches your active app and drops context-aware remarks (late-night coding, long YouTube sessions, etc.)
- **LLM-Powered Imagination** — Combines memories + context to generate autonomous speech
- **Any VRM Model** — Drag & drop your own `.vrm` character file
- **10 Languages** — English, Korean, Japanese, Chinese (Simplified/Traditional), Spanish, French, German, Portuguese, Russian
- **Cross-Platform** — macOS (Apple Silicon + Intel) and Windows

---

## Quick Start

### Install (macOS)

```bash
curl -fsSL "https://raw.githubusercontent.com/buyve/OpenMaiWaifu/main/scripts/install.sh" | bash
```

The installer will:
1. Download the latest release
2. Install to `/Applications`
3. Walk you through language, name, personality, and AI model setup

### Manual Download

Grab the latest build from [Releases](https://github.com/buyve/OpenMaiWaifu/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `AI-Desktop-Companion_vX.X.X_darwin-aarch64.tar.gz` |
| macOS (Intel) | `AI-Desktop-Companion_vX.X.X_darwin-x86_64.tar.gz` |
| Windows | `AI-Desktop-Companion_vX.X.X_windows-x86_64.msi` |

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Transparent Tauri Window (always-on-top, full screen)  │
│                                                         │
│   ┌──────────┐   ┌──────────┐   ┌──────────────────┐   │
│   │ VRM      │   │ Speech   │   │ Chat Window      │   │
│   │ Viewer   │   │ Bubble   │   │ (expandable)     │   │
│   │ Three.js │   │          │   │                  │   │
│   └──────────┘   └──────────┘   └──────────────────┘   │
│        │                                                │
│   ┌────┴─────────────────────────────────────────────┐  │
│   │  React Frontend (TypeScript)                     │  │
│   │  ┌─────────┐ ┌─────────┐ ┌───────┐ ┌─────────┐ │  │
│   │  │ Comment │ │ Memory  │ │ Sense │ │ Emotion │ │  │
│   │  │ Engine  │ │ Manager │ │ of    │ │ State   │ │  │
│   │  │         │ │ (4-tier)│ │ Self  │ │ Machine │ │  │
│   │  └─────────┘ └─────────┘ └───────┘ └─────────┘ │  │
│   └──────────────────────────────────────────────────┘  │
│        │ IPC                                            │
│   ┌────┴─────────────────────────────────────────────┐  │
│   │  Rust Backend (Tauri)                            │  │
│   │  Screen Watch · Mouse Polling · OpenClaw CLI     │  │
│   └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    │ OpenClaw │  Local AI gateway (LLM routing)
    │ Gateway  │  Anthropic · OpenAI · Gemini · Copilot
    └─────────┘
```

**Screen Watch** detects your active app → **Comment Engine** evaluates rules → character speaks. Conversations go through **OpenClaw** to your chosen LLM. Responses are parsed for `[emotion:X]` and `[motion:X]` tags, driving facial expressions and body animations on the VRM model.

All memories are stored locally (localStorage). No data leaves your machine unless you chat with the LLM.

---

## Memory Architecture

Inspired by Pixar's *Inside Out* — memories have emotions, can be promoted or forgotten, and shape the character's identity.

```
 Conversation ──→ M30 (30 days) ──→ M90 (90 days) ──→ M365 (1 year) ──→ M0 (Core)
                  Short-term         Mid-term          Long-term         Permanent
                  │                  │                  │                 │
                  └── Emotions ──────┴── Promotion ─────┴── Personality ──┘
                      (joy, sadness,     (reference count,   Islands &
                       anger, fear...)    intensity, spread)  Beliefs
```

- **Promotion**: Frequently referenced memories get promoted up tiers
- **Flashbulb**: Extremely intense memories skip the age requirement
- **Forgetting**: Expired memories enter a 7-day queue before permanent deletion
- **Personality Islands**: Core memories build identity aspects (Bond, Tsundere, Curiosity...)
- **Sense of Self**: LLM extracts "I am ___" beliefs from core memories, with anxiety prevention

> See [docs/MEMORY_ARCHITECTURE.md](docs/MEMORY_ARCHITECTURE.md) for the full design.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Three.js, @pixiv/three-vrm |
| **Backend** | Rust, Tauri v2 |
| **AI** | OpenClaw (local gateway → Anthropic / OpenAI / Gemini / Copilot) |
| **Physics** | Custom 2D platform physics (gravity, dock/window collision) |
| **Build** | Vite, GitHub Actions (macOS + Windows) |
| **Test** | Vitest, JSDOM |

---

## Development

### Prerequisites

- Node.js 20+
- Rust (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- [OpenClaw CLI](https://github.com/openclaw/openclaw) (for AI features)

### Setup

```bash
git clone https://github.com/buyve/OpenMaiWaifu.git
cd OpenMaiWaifu
npm install
```

### Run

```bash
npm run tauri dev
```

### Test

```bash
npm test          # watch mode
npm run test:run  # single run (192 tests)
```

### Build

```bash
npm run tauri build
```

### Other Commands

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier
```

---

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components (VRMViewer, Chat, Settings, etc.)
│   ├── hooks/              # React hooks (useVRM, useEmotion, useScreenWatch...)
│   └── lib/                # Core logic
│       ├── i18n/           # Internationalization (10 locales)
│       ├── memoryManager   # 4-tier memory system
│       ├── senseOfSelf     # Belief extraction & identity
│       ├── personalityIslands  # Inside Out personality system
│       ├── commentEngine   # Screen-aware remark generation
│       ├── imaginationLand # Autonomous thought generation
│       ├── emotionParser   # LLM response → emotion/motion tags
│       ├── petBehavior     # Idle/reacting state machine
│       ├── platformPhysics # 2D physics (gravity, platforms)
│       └── openclaw        # OpenClaw API client
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # Tauri setup, IPC handlers, tray menu
│       ├── screen.rs       # Active window detection (OS APIs)
│       ├── openclaw.rs     # CLI subprocess management
│       └── hittest.rs      # Mouse position broadcasting
├── assets/                 # VRM models & animations
├── scripts/                # Install script
├── docs/                   # Architecture documentation
└── .github/workflows/      # CI/CD (release builds)
```

---

## Configuration

The app stores configuration at:

| File | Location | Purpose |
|------|----------|---------|
| `config.json` | `~/.config/ai-desktop-companion/` | OpenClaw gateway URL, agent ID, CLI path |
| `firstrun.json` | `~/Library/Application Support/ai-desktop-companion/` | Initial setup (name, personality, language) |
| localStorage | In-app (WebView) | Memories, beliefs, personality islands, locale |

---

## Roadmap

- [x] VRM character rendering with emotion expressions
- [x] Screen-aware comment engine
- [x] Inside Out memory system (M30 → M0)
- [x] Personality islands & sense of self
- [x] Imagination engine (autonomous remarks)
- [x] Multi-language support (10 locales)
- [x] Install wizard with personality selection
- [ ] Voice input/output (TTS/STT)
- [ ] Linux support
- [ ] Plugin system for custom behaviors
- [ ] Mobile companion app

---

## License

[MIT](LICENSE) &copy; 2026 buyve

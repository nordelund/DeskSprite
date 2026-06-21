<p align="center">
  <img src="icon.png" width="80" />
</p>
<h1 align="center">DeskSprite</h1>
<p align="center">
  <b>English</b> | <a href="./README.zh.md">中文</a>
</p>
<p align="center">
  A desktop pet that monitors your AI coding agents in real time. Supports macOS and Windows.
</p>

<p align="center">
  <b>Code Mode</b><br/>
  <sub>macOS: OpenClaw, Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Hermes Agent</sub><br/>
  <sub>Windows: OpenClaw, Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Hermes Agent (remote SSH)</sub>
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/74b8bbf8-ddcf-4149-a91e-d18d5c24fec6" width="600" />
</p>
<p align="center">
  <b>Pet Mode</b>
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/2a143250-174a-406e-8a43-fd30db7ce071" width="600" />
</p>

## What it does

- Reacts to OpenClaw / Claude Code / Codex / Cursor / Gemini CLI / Hermes Agent activity in real time (working, idle, waiting)
- Desktop pet character animates when agents work and sleeps when idle (macOS notch or Windows taskbar)
- **macOS**: hover over the notch area to reveal the session detail panel
- Auto-discovers local OpenClaw agents with session lists, chat history, and daily calls/tokens charts
- Listens to local Claude Code, Codex, Cursor, and Gemini CLI sessions via hooks, view live conversations
- Gemini CLI token usage statistics via local telemetry
- Connect to remote OpenClaw / Hermes Agent instances running on servers via SSH
- Custom character animations, pair different agents with different characters
- Customizable island backgrounds with crop tool
- Completion & waiting sound effects

## Requirements

- macOS or Windows
- [OpenClaw](https://github.com/nicepkg/openclaw), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [Cursor](https://www.cursor.com), [Gemini CLI](https://github.com/google-gemini/gemini-cli), and/or [Hermes Agent](https://github.com/NousResearch/hermes-agent) installed

## How it works

```
OpenClaw Agents ──→ JSONL session files ──→ Health polling ──→ Activity state
Claude Code     ──→ Hooks ──→ Event parser ──→ Activity state
Codex           ──→ Hooks ──→ Event parser ──→ Activity state
Cursor          ──→ Hooks ──→ Event parser ──→ Activity state
Gemini CLI      ──→ Hooks ──→ Event parser ──→ Activity state
Hermes Agent    ──→ Plugin ──→ Event parser ──→ Activity state
                                                    ↓
                    Animated sprites ← State machine ← Sound effects
```

DeskSprite polls OpenClaw session files to detect agent activity, and listens to Claude Code, Codex, Cursor, Gemini CLI, and Hermes Agent via installed hooks/plugins. Activity states drive character animations on the notch island (macOS) or taskbar area (Windows), with an expandable panel for session details, chat history, and metrics.

## Tech Stack

- **Tauri v2** + **React** + **TypeScript** — frontend
- **Rust** — backend for system interaction, SSH tunneling, and API communication
- macOS / Windows native APIs for window management and positioning

## Development

```bash
cd frontend
npm install
npx tauri dev
```

> If you see "access denied (os error 5)" on Windows, kill the old `ooclaw.exe` process first.

## Contributing

Bug reports, feature suggestions, and pull requests are welcome.

## Credits

- [OC-Claw](https://github.com/rainnoon/oc-claw) — upstream project this fork is based on
- [Notchi](https://github.com/sk-ruban/notchi) — design inspiration for notch companion concept and grass island
- [Vibe Island](https://github.com/vibeislandapp/vibe-island) — interaction design reference

## License

MIT

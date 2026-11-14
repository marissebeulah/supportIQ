# SupportIQ Agent (Windows)

The native agent behind the portal's remote desktop support. It runs in the
customer's system tray, pairs with their SupportIQ account, asks them to approve
each session, streams the screen to the technician's browser, and injects the
technician's mouse and keyboard input.

The server side already exists in `server/routes/agent.routes.js` and
`server/routes/remote.routes.js`; this folder is the customer-installed app.

## Build and install

```bash
npm run build:agent   # compile only -> agent/build/SupportIQ-Agent.exe
npm run install:agent # build, install, and restart the tray app
```

This compiles `agent/src/*.cs` with the .NET Framework compiler bundled with
Windows (`csc.exe`). No .NET SDK or admin rights are needed. The portal serves
that file from `/api/agent/download` once it exists.

`install:agent` copies it to `%LOCALAPPDATA%\Programs\SupportIQ`, refreshes the
Start Menu shortcut, stops any running agent, and starts the installed copy with
its existing pairing. The first install enables start-with-Windows; later
installs keep the user's choice.

## Self-update

On startup and every 30 minutes (when idle) the agent compares the SHA-256 of
its own exe with the build published by the API. When they differ it downloads
the new build into `update\`, verifies the hash, swaps itself, and restarts. An
active session or an open consent prompt postpones the update.

After changing agent source, run `npm run build:agent` once: every installed
agent picks the new build up automatically. `npm run install:agent` is only
needed to install on a new PC or to force a restart.

## Pair a PC

1. Open a request in the SupportIQ portal as the customer and choose **Set up
   this PC**.
2. Run `SupportIQ-Agent.exe` (or click the portal's agent link, which uses the
   registered `supportiq-agent://pair` protocol).
3. Enter the server address and the 8-character pairing code.
4. Leave the agent running in the tray. It starts with Windows if the option is
   checked in the agent window.

The device token is stored in `%APPDATA%\SupportIQ\agent.json`. Diagnostics go to
`%APPDATA%\SupportIQ\agent.log`.

## Session flow

- IT requests a remote session for a request they can access.
- The agent long-polls the API and shows a topmost **Allow / Don't allow**
  prompt. Nothing is shared until the customer clicks Allow.
- While active, the agent captures the primary screen at up to ~9 fps (JPEG,
  downscaled to 1600 px wide) and posts frames to the API. The technician's
  browser reads them from `/api/remote-sessions/:id/frame`.
- Technician mouse/keyboard events are queued by the API and applied by the
  agent with `SendInput`.
- The technician can switch on **Privacy mode** from the viewer. The customer's
  display is covered by a full-screen "secure support session" animation while
  the technician keeps working on the real desktop. The overlay is click-through,
  never takes keyboard focus, and is excluded from screen capture, so the
  technician still sees and controls the real screen. The red Stop sharing bar
  stays on top and ends the session immediately.
- A red **Stop sharing** bar stays at the top of the customer's screen. It, the
  portal's Stop button, and the Ctrl+Alt+Del-secured desktop all disconnect
  immediately. Ending a session clears the frame and command queues.

Frames and input are transient: they live in API process memory and are dropped
when the session ends. They are never written to the database or disk.

## Limitations

- **Primary monitor only.** Multi-monitor setups share the primary display.
- **Privacy mode** relies on `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`,
  which needs Windows 10 version 2004 or later. On older builds the agent logs a
  warning and leaves the screen visible instead of blinding the technician.
- **Integrity levels.** The agent runs as the signed-in user (asInvoker). It can
  control apps at the same or lower integrity; elevated windows (UAC prompts,
  Task Manager as admin) ignore injected input unless the agent itself is run
  elevated.
- **Windows 10/11** with .NET Framework 4.x (included with Windows). The secure
  desktop cannot be captured or controlled by any user-mode agent.
- The customer can revoke a PC at any time with **Forget this PC** in the agent
  or **Forget** in the portal. The next poll is rejected with 401 and the agent
  clears its local pairing.

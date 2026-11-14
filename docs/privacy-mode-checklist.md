# Privacy mode — manual test checklist

Privacy mode has been verified with a harness that drives the agent's own
classes (focus hand-off, `WM_KEYDOWN` delivery, `WindowFromPoint` click-through,
capture exclusion, cursor pixels). That proves the mechanism, not the
experience: a harness posts messages straight at a window, while real input goes
through `SendInput` into whatever the desktop session has focused.

Run this checklist before a demo, and after any change to
`agent/src/PrivacyScreen.cs`, `agent/src/NativeInput.cs`, or the capture loop in
`agent/src/Forms.cs`.

---

## Setup

1. Build the agent:

   ```bash
   npm run build:agent
   ```

2. Start the app over HTTPS so the agent and the viewer can both reach it:

   ```bash
   npm run dev:https
   ```

   Confirm the console shows `[api] ... listening on http://localhost:3001` and
   `Local: https://localhost:5173`.

3. Sign in as the customer (`maya@northwind.co`) and open a request, then click
   **Set up this PC** and run the installer. Leave `SupportIQ-Agent.exe` in the
   tray.

4. In a second browser profile (or another device), sign in as IT
   (`alex@supportiq.app`) and open the same request.

5. IT requests a session, the customer approves it, and the remote viewer shows
   the desktop. All accounts use the password `support123`.

---

## Checks

Turn privacy mode on from the eye button, then walk through these. "Customer"
means the machine running the agent; "technician" means the viewer.

| # | Check | Expected |
|---|-------|----------|
| 1 | Customer's screen | Full-screen "secure support session" animation, no desktop visible |
| 2 | Technician's viewer | Real desktop, **not** the animation |
| 3 | Click a desktop icon on the customer's screen | Selection happens; the overlay does not swallow the click |
| 4 | Double-click a folder | It opens |
| 5 | Type into Notepad | Characters appear — nothing is dropped |
| 6 | Drag-select text | Selection follows the drag |
| 7 | Alt+Tab, Win key, taskbar hover | Windows responds normally |
| 8 | Move the mouse while the customer watches | The customer sees **no** pointer anywhere, including over the animation |
| 9 | Watch the technician's viewer while moving | An arrow is drawn at the injected position, tracking the motion |
| 10 | Scroll a long page | It scrolls |
| 11 | Turn privacy off | Animation disappears, desktop is back, pointer visible again |
| 12 | Close the agent from the tray while privacy is on | Pointer returns immediately |
| 13 | Force-kill `SupportIQ-Agent.exe` (Task Manager) while privacy is on | Pointer stays invisible; starting the agent again restores it |
| 14 | End the session with **Stop sharing** | Sharing stops, overlay gone, pointer normal |

---

## Known limitations (expected, not failures)

- **Custom pointers still show.** Only the standard arrow is blanked. An app
  that paints its own cursor (some games, CAD, drawing tools) can still draw a
  pointer over the privacy screen.
- **Killed agent leaves no pointer** until the agent is started again; the
  restore runs on process exit and at agent startup.
- **Elevated windows ignore input.** Task Manager and other elevated windows
  reject injected input unless the agent itself runs elevated.
- **UAC and secure desktop.** Windows does not allow synthetic input on the
  secure desktop, so nothing works while a UAC prompt is up.

---

## Recording a failure

Note the check number, what you saw, the app you were in, and whether the agent
was running elevated. The useful evidence for a bug report is: the agent log
from the tray, and whether checks 1–2 (overlay/exclusion) still passed, since
that separates a focus problem from a capture problem.

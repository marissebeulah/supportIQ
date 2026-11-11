using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace SupportIQ.Agent
{
    internal static class NativeMethods
    {
        public const int INPUT_MOUSE = 0;
        public const int INPUT_KEYBOARD = 1;

        public const uint KEYEVENTF_KEYUP = 0x0002;
        public const uint KEYEVENTF_UNICODE = 0x0004;

        public const uint MOUSEEVENTF_MOVE = 0x0001;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        public const uint MOUSEEVENTF_WHEEL = 0x0800;
        public const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        public const int SM_XVIRTUALSCREEN = 76;
        public const int SM_YVIRTUALSCREEN = 77;
        public const int SM_CXVIRTUALSCREEN = 78;
        public const int SM_CYVIRTUALSCREEN = 79;

        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;
        public const uint MOD_NOREPEAT = 0x4000;
        public const int WM_HOTKEY = 0x0312;
        public const int VK_F12 = 0x7B;

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public int mouseData;
            public uint dwFlags;
            public int time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public short wVk;
            public short wScan;
            public uint dwFlags;
            public int time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct HARDWAREINPUT
        {
            public int uMsg;
            public short wParamL;
            public short wParamH;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct INPUTUNION
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
            [FieldOffset(0)]
            public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public int type;
            public INPUTUNION u;
        }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern short VkKeyScanEx(char ch, IntPtr dwhkl);

        [DllImport("user32.dll")]
        public static extern IntPtr GetKeyboardLayout(uint idThread);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    }

    /// <summary>Translates browser input events into real Windows input.</summary>
    public static class InputInjector
    {
        private static readonly HashSet<int> pressedKeys = new HashSet<int>();
        private static readonly HashSet<int> pressedButtons = new HashSet<int>();
        private static readonly HashSet<string> modifiers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private static readonly Dictionary<string, int> NamedKeys = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            { "Enter", 0x0D },
            { "Backspace", 0x08 },
            { "Tab", 0x09 },
            { "Escape", 0x1B },
            { "Delete", 0x2E },
            { "Insert", 0x2D },
            { "Home", 0x24 },
            { "End", 0x23 },
            { "PageUp", 0x21 },
            { "PageDown", 0x22 },
            { "ArrowUp", 0x26 },
            { "ArrowDown", 0x28 },
            { "ArrowLeft", 0x25 },
            { "ArrowRight", 0x27 },
            { "Up", 0x26 },
            { "Down", 0x28 },
            { "Left", 0x25 },
            { "Right", 0x27 },
            { "CapsLock", 0x14 },
            { "NumLock", 0x90 },
            { "ScrollLock", 0x91 },
            { "Pause", 0x13 },
            { "ContextMenu", 0x5D },
            { "PrintScreen", 0x2C },
            { "Space", 0x20 },
            { "Control", 0x11 },
            { "Shift", 0x10 },
            { "Alt", 0x12 },
            { "Meta", 0x5B },
            { "F1", 0x70 },
            { "F2", 0x71 },
            { "F3", 0x72 },
            { "F4", 0x73 },
            { "F5", 0x74 },
            { "F6", 0x75 },
            { "F7", 0x76 },
            { "F8", 0x77 },
            { "F9", 0x78 },
            { "F10", 0x79 },
            { "F11", 0x7A },
            { "F12", 0x7B }
        };

        public static void Handle(IEnumerable<InputEventDto> events)
        {
            if (events == null) return;
            foreach (InputEventDto item in events)
            {
                if (item == null || item.t == null) continue;
                switch (item.t)
                {
                    case "m":
                        MovePointer(item.x, item.y);
                        break;
                    case "md":
                        SendMouseButton(item.b, true);
                        break;
                    case "mu":
                        SendMouseButton(item.b, false);
                        break;
                    case "w":
                        SendWheel(item.d);
                        break;
                    case "kd":
                        SendKey(item.k, item.c, true);
                        break;
                    case "ku":
                        SendKey(item.k, item.c, false);
                        break;
                }
            }
        }

        public static void ReleaseAll()
        {
            foreach (int vk in new List<int>(pressedKeys)) SendVirtualKey(vk, false);
            foreach (int button in new List<int>(pressedButtons)) SendMouseButton(button, false);
            pressedKeys.Clear();
            pressedButtons.Clear();
            modifiers.Clear();
        }

        private static void MovePointer(double normalizedX, double normalizedY)
        {
            int left = NativeMethods.GetSystemMetrics(NativeMethods.SM_XVIRTUALSCREEN);
            int top = NativeMethods.GetSystemMetrics(NativeMethods.SM_YVIRTUALSCREEN);
            int width = NativeMethods.GetSystemMetrics(NativeMethods.SM_CXVIRTUALSCREEN);
            int height = NativeMethods.GetSystemMetrics(NativeMethods.SM_CYVIRTUALSCREEN);
            if (width <= 1) width = 2;
            if (height <= 1) height = 2;

            double x = Math.Min(1, Math.Max(0, normalizedX));
            double y = Math.Min(1, Math.Max(0, normalizedY));
            int absoluteX = (int)Math.Round(x * 65535.0);
            int absoluteY = (int)Math.Round(y * 65535.0);

            NativeMethods.INPUT input = new NativeMethods.INPUT();
            input.type = NativeMethods.INPUT_MOUSE;
            input.u.mi.dx = absoluteX;
            input.u.mi.dy = absoluteY;
            input.u.mi.dwFlags = NativeMethods.MOUSEEVENTF_MOVE
                | NativeMethods.MOUSEEVENTF_ABSOLUTE
                | NativeMethods.MOUSEEVENTF_VIRTUALDESK;
            Send(input);
        }

        private static void SendMouseButton(int button, bool down)
        {
            uint flag;
            if (button == 2) flag = down ? NativeMethods.MOUSEEVENTF_RIGHTDOWN : NativeMethods.MOUSEEVENTF_RIGHTUP;
            else if (button == 1) flag = down ? NativeMethods.MOUSEEVENTF_MIDDLEDOWN : NativeMethods.MOUSEEVENTF_MIDDLEUP;
            else flag = down ? NativeMethods.MOUSEEVENTF_LEFTDOWN : NativeMethods.MOUSEEVENTF_LEFTUP;

            NativeMethods.INPUT input = new NativeMethods.INPUT();
            input.type = NativeMethods.INPUT_MOUSE;
            input.u.mi.dwFlags = flag;
            Send(input);

            if (down) pressedButtons.Add(button);
            else pressedButtons.Remove(button);
        }

        private static void SendWheel(double direction)
        {
            NativeMethods.INPUT input = new NativeMethods.INPUT();
            input.type = NativeMethods.INPUT_MOUSE;
            input.u.mi.mouseData = (int)(-Math.Sign(direction) * 120);
            input.u.mi.dwFlags = NativeMethods.MOUSEEVENTF_WHEEL;
            Send(input);
        }

        private static void SendKey(string key, string code, bool down)
        {
            if (string.IsNullOrEmpty(key)) return;

            if (key.Length == 1)
            {
                bool shortcut = modifiers.Contains("Control") || modifiers.Contains("Alt") || modifiers.Contains("Meta");
                if (shortcut)
                {
                    int virtualKey = VirtualKeyFromChar(key[0]);
                    if (virtualKey > 0)
                    {
                        SendVirtualKey(virtualKey, down);
                        return;
                    }
                }
                SendUnicode(key[0], down);
                return;
            }

            int named;
            if (!NamedKeys.TryGetValue(key, out named)) return;
            SendVirtualKey(named, down);
            if (IsModifier(key))
            {
                if (down) modifiers.Add(key);
                else modifiers.Remove(key);
            }
        }

        private static bool IsModifier(string key)
        {
            return string.Equals(key, "Control", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "Shift", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "Alt", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "Meta", StringComparison.OrdinalIgnoreCase);
        }

        private static int VirtualKeyFromChar(char value)
        {
            short scan = NativeMethods.VkKeyScanEx(value, NativeMethods.GetKeyboardLayout(0));
            int virtualKey = scan & 0xFF;
            if (virtualKey == 0xFF) return 0;
            return virtualKey;
        }

        private static void SendVirtualKey(int virtualKey, bool down)
        {
            NativeMethods.INPUT input = new NativeMethods.INPUT();
            input.type = NativeMethods.INPUT_KEYBOARD;
            input.u.ki.wVk = (short)virtualKey;
            input.u.ki.wScan = 0;
            input.u.ki.dwFlags = down ? 0u : NativeMethods.KEYEVENTF_KEYUP;
            Send(input);

            if (down) pressedKeys.Add(virtualKey);
            else pressedKeys.Remove(virtualKey);
        }

        private static void SendUnicode(char value, bool down)
        {
            NativeMethods.INPUT input = new NativeMethods.INPUT();
            input.type = NativeMethods.INPUT_KEYBOARD;
            input.u.ki.wVk = 0;
            input.u.ki.wScan = (short)value;
            input.u.ki.dwFlags = NativeMethods.KEYEVENTF_UNICODE
                | (down ? 0u : NativeMethods.KEYEVENTF_KEYUP);
            Send(input);
        }

        private static void Send(NativeMethods.INPUT input)
        {
            NativeMethods.INPUT[] inputs = new NativeMethods.INPUT[1];
            inputs[0] = input;
            NativeMethods.SendInput(1, inputs, Marshal.SizeOf(typeof(NativeMethods.INPUT)));
        }
    }
}

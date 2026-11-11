using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SupportIQ
{
    internal sealed class CapturedFrame : IDisposable
    {
        public Bitmap Bitmap;

        public int Width
        {
            get { return Bitmap == null ? 0 : Bitmap.Width; }
        }

        public int Height
        {
            get { return Bitmap == null ? 0 : Bitmap.Height; }
        }

        public void Dispose()
        {
            if (Bitmap != null)
            {
                Bitmap.Dispose();
                Bitmap = null;
            }
        }

        public byte[] ToJpeg(long quality)
        {
            using (MemoryStream stream = new MemoryStream())
            {
                ImageCodecInfo codec = FindJpegCodec();
                using (EncoderParameters parameters = new EncoderParameters(1))
                {
                    parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                    Bitmap.Save(stream, codec, parameters);
                }
                return stream.ToArray();
            }
        }

        private static ImageCodecInfo FindJpegCodec()
        {
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.FormatID == ImageFormat.Jpeg.Guid) return codec;
            }
            return null;
        }
    }

    /// <summary>GDI screen capture downscaled to keep frames small enough to relay.</summary>
    internal static class ScreenCapture
    {
        private const int CursorShowing = 0x0001;
        private const int DrawIconNormal = 0x0003;

        [StructLayout(LayoutKind.Sequential)]
        private struct Point32
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CursorInfo
        {
            public int Size;
            public int Flags;
            public IntPtr Cursor;
            public Point32 Position;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IconInfo
        {
            public int IsIcon;
            public int HotspotX;
            public int HotspotY;
            public IntPtr MaskBitmap;
            public IntPtr ColorBitmap;
        }

        [DllImport("user32.dll")]
        private static extern bool GetCursorInfo(ref CursorInfo info);

        [DllImport("user32.dll")]
        private static extern bool GetIconInfo(IntPtr icon, out IconInfo info);

        [DllImport("user32.dll")]
        private static extern bool DrawIconEx(
            IntPtr hdc, int x, int y, IntPtr icon, int width, int height, int step, IntPtr brush, int flags);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr handle);

        public static CapturedFrame Capture(int maxWidth)
        {
            Rectangle bounds = Screen.PrimaryScreen.Bounds;
            if (bounds.Width <= 0 || bounds.Height <= 0) return null;

            Bitmap full = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
            try
            {
                using (Graphics graphics = Graphics.FromImage(full))
                {
                    graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
                }
            }
            catch
            {
                full.Dispose();
                return null;
            }

            double scale = Math.Min(1.0, (double)maxWidth / bounds.Width);
            Bitmap output = full;
            if (scale < 0.999)
            {
                int width = Math.Max(1, (int)Math.Round(bounds.Width * scale));
                int height = Math.Max(1, (int)Math.Round(bounds.Height * scale));
                output = new Bitmap(width, height, PixelFormat.Format24bppRgb);
                using (Graphics graphics = Graphics.FromImage(output))
                {
                    graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
                    graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    graphics.DrawImage(full, new Rectangle(0, 0, width, height));
                }
                full.Dispose();
            }

            // CopyFromScreen never includes the pointer, so the technician would
            // see no mouse at all. Composite the live cursor onto every frame.
            try
            {
                using (Graphics graphics = Graphics.FromImage(output))
                {
                    DrawCursor(graphics, bounds, (double)output.Width / bounds.Width);
                }
            }
            catch
            {
                // A cursor that cannot be composited must not stop screen sharing.
            }

            CapturedFrame frame = new CapturedFrame();
            frame.Bitmap = output;
            return frame;
        }

        private static void DrawCursor(Graphics graphics, Rectangle bounds, double scale)
        {
            CursorInfo cursor = new CursorInfo();
            cursor.Size = Marshal.SizeOf(typeof(CursorInfo));
            if (!GetCursorInfo(ref cursor)) return;
            if ((cursor.Flags & CursorShowing) == 0 || cursor.Cursor == IntPtr.Zero) return;

            IconInfo icon;
            if (!GetIconInfo(cursor.Cursor, out icon)) return;

            try
            {
                // GetCursorInfo reports the hotspot, not the icon's top-left corner.
                int x = (int)Math.Round((cursor.Position.X - bounds.Left) * scale) - icon.HotspotX;
                int y = (int)Math.Round((cursor.Position.Y - bounds.Top) * scale) - icon.HotspotY;

                IntPtr hdc = graphics.GetHdc();
                try
                {
                    DrawIconEx(hdc, x, y, cursor.Cursor, 0, 0, 0, IntPtr.Zero, DrawIconNormal);
                }
                finally
                {
                    graphics.ReleaseHdc(hdc);
                }
            }
            finally
            {
                // GetIconInfo copies both bitmaps; they must be released or GDI leaks.
                if (icon.MaskBitmap != IntPtr.Zero) DeleteObject(icon.MaskBitmap);
                if (icon.ColorBitmap != IntPtr.Zero) DeleteObject(icon.ColorBitmap);
            }
        }
    }

    /// <summary>Injects the technician's mouse and keyboard events with SendInput.</summary>
    internal static class ScreenInjector
    {
        private const uint InputMouse = 0;
        private const uint InputKeyboard = 1;

        private const uint MouseMove = 0x0001;
        private const uint MouseLeftDown = 0x0002;
        private const uint MouseLeftUp = 0x0004;
        private const uint MouseRightDown = 0x0008;
        private const uint MouseRightUp = 0x0010;
        private const uint MouseMiddleDown = 0x0020;
        private const uint MouseMiddleUp = 0x0040;
        private const uint MouseWheel = 0x0800;
        private const uint MouseAbsolute = 0x8000;

        private const uint KeyUp = 0x0002;
        private const uint KeyExtended = 0x0001;

        private static DateTime lastFailureLog = DateTime.MinValue;

        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KeyboardInput
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MouseInput mouse;
            [FieldOffset(0)] public KeyboardInput keyboard;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Input
        {
            public uint type;
            public InputUnion union;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint count, Input[] inputs, int size);

        private static readonly Dictionary<string, int> VirtualKeys = BuildVirtualKeys();
        private static readonly HashSet<int> ExtendedKeys = BuildExtendedKeys();

        public static void Apply(List<InputCommand> commands)
        {
            if (commands == null || commands.Count == 0) return;
            foreach (InputCommand command in commands)
            {
                try
                {
                    switch (command.Type)
                    {
                        case "m":
                            Move(command.X, command.Y);
                            break;
                        case "md":
                            Button(command.Button, true);
                            break;
                        case "mu":
                            Button(command.Button, false);
                            break;
                        case "w":
                            Wheel(command.Direction);
                            break;
                        case "kd":
                            Key(command.Code, command.Key, true);
                            break;
                        case "ku":
                            Key(command.Code, command.Key, false);
                            break;
                    }
                }
                catch
                {
                    // A single rejected event must not end the session.
                }
            }
        }

        private static void Move(double x, double y)
        {
            double clampedX = Math.Min(1.0, Math.Max(0.0, x));
            double clampedY = Math.Min(1.0, Math.Max(0.0, y));
            Input input = new Input();
            input.type = InputMouse;
            input.union.mouse.dx = (int)Math.Round(clampedX * 65535.0);
            input.union.mouse.dy = (int)Math.Round(clampedY * 65535.0);
            input.union.mouse.dwFlags = MouseMove | MouseAbsolute;
            Send(new Input[] { input });
        }

        private static void Button(int button, bool down)
        {
            uint flag;
            if (button == 0) flag = down ? MouseLeftDown : MouseLeftUp;
            else if (button == 1) flag = down ? MouseMiddleDown : MouseMiddleUp;
            else if (button == 2) flag = down ? MouseRightDown : MouseRightUp;
            else return;

            Input input = new Input();
            input.type = InputMouse;
            input.union.mouse.dwFlags = flag;
            Send(new Input[] { input });
        }

        private static void Wheel(int direction)
        {
            if (direction == 0) return;
            Input input = new Input();
            input.type = InputMouse;
            input.union.mouse.dwFlags = MouseWheel;
            input.union.mouse.mouseData = (uint)(direction > 0 ? -120 : 120);
            Send(new Input[] { input });
        }

        private static void Key(string code, string key, bool down)
        {
            int virtualKey = ResolveVirtualKey(code, key);
            if (virtualKey == 0) return;

            Input input = new Input();
            input.type = InputKeyboard;
            input.union.keyboard.wVk = (ushort)virtualKey;
            uint flags = down ? 0 : KeyUp;
            if (ExtendedKeys.Contains(virtualKey)) flags |= KeyExtended;
            input.union.keyboard.dwFlags = flags;
            Send(new Input[] { input });
        }

        private static int ResolveVirtualKey(string code, string key)
        {
            if (!string.IsNullOrEmpty(code))
            {
                int fromCode;
                if (VirtualKeys.TryGetValue(code, out fromCode)) return fromCode;
            }
            if (string.IsNullOrEmpty(key)) return 0;
            int fromKey;
            if (VirtualKeys.TryGetValue(key, out fromKey)) return fromKey;
            if (key.Length == 1)
            {
                char c = char.ToUpperInvariant(key[0]);
                if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return c;
            }
            return 0;
        }

        private static void Send(Input[] inputs)
        {
            if (inputs == null || inputs.Length == 0) return;
            uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
            if (sent == 0)
            {
                // Most often UIPI: an elevated window ignores input from this process.
                DateTime now = DateTime.UtcNow;
                if ((now - lastFailureLog).TotalSeconds > 60)
                {
                    lastFailureLog = now;
                    Log.Write(
                        "Input injection was blocked (Win32 error " + Marshal.GetLastWin32Error() +
                        "). If this app runs as administrator, the agent must run elevated too.");
                }
            }
        }

        private static Dictionary<string, int> BuildVirtualKeys()
        {
            Dictionary<string, int> map = new Dictionary<string, int>(StringComparer.Ordinal);
            for (int i = 0; i < 26; i++)
            {
                char letter = (char)('A' + i);
                map["Key" + letter] = 0x41 + i;
                map[letter.ToString()] = 0x41 + i;
                map[letter.ToString().ToLowerInvariant()] = 0x41 + i;
            }
            for (int i = 0; i < 10; i++)
            {
                map["Digit" + i] = 0x30 + i;
                map["Numpad" + i] = 0x60 + i;
                map[i.ToString()] = 0x30 + i;
            }
            for (int i = 1; i <= 12; i++)
            {
                map["F" + i] = 0x6F + i;
            }

            map["Backquote"] = 0xC0;
            map["Minus"] = 0xBD;
            map["Equal"] = 0xBB;
            map["BracketLeft"] = 0xDB;
            map["BracketRight"] = 0xDD;
            map["Backslash"] = 0xDC;
            map["Semicolon"] = 0xBA;
            map["Quote"] = 0xDE;
            map["Comma"] = 0xBC;
            map["Period"] = 0xBE;
            map["Slash"] = 0xBF;

            map["Backspace"] = 0x08;
            map["Tab"] = 0x09;
            map["Enter"] = 0x0D;
            map["NumpadEnter"] = 0x0D;
            map["Shift"] = 0x10;
            map["ShiftLeft"] = 0xA0;
            map["ShiftRight"] = 0xA1;
            map["Control"] = 0x11;
            map["ControlLeft"] = 0xA2;
            map["ControlRight"] = 0xA3;
            map["Alt"] = 0x12;
            map["AltLeft"] = 0xA4;
            map["AltRight"] = 0xA5;
            map["Meta"] = 0x5B;
            map["MetaLeft"] = 0x5B;
            map["MetaRight"] = 0x5C;
            map["Escape"] = 0x1B;
            map["Space"] = 0x20;
            map["PageUp"] = 0x21;
            map["PageDown"] = 0x22;
            map["End"] = 0x23;
            map["Home"] = 0x24;
            map["ArrowLeft"] = 0x25;
            map["ArrowUp"] = 0x26;
            map["ArrowRight"] = 0x27;
            map["ArrowDown"] = 0x28;
            map["PrintScreen"] = 0x2C;
            map["Insert"] = 0x2D;
            map["Delete"] = 0x2E;
            map["ContextMenu"] = 0x5D;
            map["CapsLock"] = 0x14;
            map["NumLock"] = 0x90;
            map["ScrollLock"] = 0x91;
            map["Pause"] = 0x13;
            map["NumpadMultiply"] = 0x6A;
            map["NumpadAdd"] = 0x6B;
            map["NumpadSubtract"] = 0x6D;
            map["NumpadDecimal"] = 0x6E;
            map["NumpadDivide"] = 0x6F;
            map["NumpadEqual"] = 0x92;
            return map;
        }

        private static HashSet<int> BuildExtendedKeys()
        {
            return new HashSet<int>
            {
                0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
                0x2C, 0x2D, 0x2E, 0x5B, 0x5C, 0x5D, 0x6F, 0x90,
                0xA3, 0xA5,
            };
        }
    }
}

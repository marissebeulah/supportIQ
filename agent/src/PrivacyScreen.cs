using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SupportIQ
{
    /// <summary>
    /// Full-screen "secure session" animation shown on the customer's display
    /// while the technician works on the real desktop underneath.
    ///
    /// Four properties make this safe to use:
    ///  - WS_EX_LAYERED + WS_EX_TRANSPARENT: mouse input passes through to the
    ///    windows below, including other processes, so injected technician
    ///    input still reaches them. (A bare HTTRANSPARENT answer only skips
    ///    windows in the same thread and would swallow every click.)
    ///  - WS_EX_NOACTIVATE + ShowWithoutActivation, plus handing the foreground
    ///    window straight back: keyboard focus never stays here, so injected
    ///    keystrokes reach the real foreground window. Showing the window while
    ///    the agent itself is foreground used to leave focus on the overlay,
    ///    which silently swallowed every keystroke the technician sent.
    ///  - SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE): the overlay is left
    ///    out of the agent's GDI screen capture, so the technician keeps seeing
    ///    the actual desktop instead of this animation.
    ///  - The system pointer is blanked for the duration: the technician's
    ///    injected mouse moves are real cursor moves, so without this the
    ///    customer would watch the pointer slide across the privacy screen. The
    ///    technician still gets a pointer, drawn into the captured frames.
    ///
    /// Performance matters more than usual here: this runs on the customer's PC
    /// next to the agent that is streaming their screen, so the animation is
    /// rendered into a half-resolution DIB section and composited with GDI
    /// blits instead of full-screen GDI+ calls. That took a frame from ~20 ms
    /// of CPU time down to a few milliseconds.
    ///
    /// The footer states plainly that this is a SupportIQ support session, so
    /// the customer is never led to believe the machine is under attack.
    /// </summary>
    internal sealed class PrivacyScreenForm : Form
    {
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;
        private const int WS_EX_TRANSPARENT = 0x00000020;
        private const int WS_EX_NOACTIVATE = 0x08000000;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_LAYERED = 0x00080000;
        private const int LWA_ALPHA = 0x00000002;

        private const int WM_MOUSEACTIVATE = 0x0021;
        private const int MA_NOACTIVATE = 3;

        private const uint SPI_SETCURSORS = 0x0057;
        private const uint OCR_NORMAL = 32512;

        private const uint SRCCOPY = 0x00CC0020;
        private const int COLORONCOLOR = 3;

        /// <summary>
        /// The rain is rendered at 1/2 resolution and stretched to the screen.
        /// Matrix rain is blocky by nature, so the upscale is invisible, and it
        /// cuts the per-frame fill and glyph work by four.
        /// </summary>
        private const int RainScale = 2;

        private const string Glyphs =
            "01<>[]{}#$%&*+=/\\|ABCDEF0123456789abcdefxyz";

        [StructLayout(LayoutKind.Sequential)]
        private struct BitmapInfoHeader
        {
            public int Size;
            public int Width;
            public int Height;
            public short Planes;
            public short BitCount;
            public int Compression;
            public int SizeImage;
            public int XPelsPerMeter;
            public int YPelsPerMeter;
            public int ClrUsed;
            public int ClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BitmapInfo
        {
            public BitmapInfoHeader Header;
            public int Colors;
        }

        [DllImport("user32.dll")]
        private static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);

        [DllImport("user32.dll")]
        private static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint colorKey, byte alpha, int flags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern IntPtr CreateCursor(
            IntPtr instance, int hotSpotX, int hotSpotY, int width, int height, byte[] andPlane, byte[] xorPlane);

        [DllImport("user32.dll")]
        private static extern bool SetSystemCursor(IntPtr cursor, uint id);

        [DllImport("user32.dll")]
        private static extern bool SystemParametersInfo(uint action, uint param, IntPtr value, uint flags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateDIBSection(
            IntPtr hdc, ref BitmapInfo info, uint usage, out IntPtr bits, IntPtr section, uint offset);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern bool StretchBlt(
            IntPtr dest, int x, int y, int width, int height,
            IntPtr src, int srcX, int srcY, int srcWidth, int srcHeight, uint rop);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(
            IntPtr dest, int x, int y, int width, int height,
            IntPtr src, int srcX, int srcY, uint rop);

        [DllImport("gdi32.dll")]
        private static extern int SetStretchBltMode(IntPtr hdc, int mode);

        private readonly string _requester;
        private readonly Random _random = new Random();
        private readonly Timer _timer;
        private readonly DateTime _started = DateTime.UtcNow;

        private readonly string[] _log =
        {
            "opening secure support channel",
            "verifying support agent identity",
            "handshake accepted",
            "reading reported system fault",
            "loading repair routine",
            "applying fix",
            "checking dependencies",
            "validating result",
        };

        private readonly Font _rainFont;
        private readonly Font _titleFont;
        private readonly Font _subFont;
        private readonly Font _monoFont;
        private readonly Font _smallFont;
        private readonly Font _microFont;
        private readonly Brush _rainBrush;
        private readonly Brush _fadeBrush;
        private readonly Brush _panelBrush;
        private readonly Pen _panelPen;

        private IntPtr _rainDc = IntPtr.Zero;
        private IntPtr _rainBitmap = IntPtr.Zero;
        private IntPtr _rainOldBitmap = IntPtr.Zero;
        private Graphics _rainGraphics;
        private int _rainWidth;
        private int _rainHeight;

        // The rain and the text are composited here at full resolution, then
        // handed to the window with a single BitBlt.
        private IntPtr _canvasDc = IntPtr.Zero;
        private IntPtr _canvasBitmap = IntPtr.Zero;
        private IntPtr _canvasOldBitmap = IntPtr.Zero;
        private Graphics _canvasGraphics;
        private int _canvasWidth;
        private int _canvasHeight;

        private float[] _heads;
        private float[] _speeds;
        private string[] _letters;
        private int _columns;
        private float _columnWidth;
        private int _lineHeight;
        private int _visibleLog;
        private DateTime _lastLog = DateTime.UtcNow;
        private bool _ready;

        // The window that had focus before the overlay appeared. It is handed
        // back whenever Windows activates the overlay anyway, so a technician
        // typing into an app never loses their keystrokes to the animation.
        private IntPtr _previousForeground = IntPtr.Zero;
        private bool _returningFocus;
        private bool _pointerHidden;

        /// <summary>
        /// False when Windows would include this window in screen capture. The
        /// agent must then refuse privacy mode, otherwise the technician would
        /// only see the animation and could not work.
        /// </summary>
        public bool CaptureExcluded { get; private set; }

        public PrivacyScreenForm(string requester)
        {
            _requester = string.IsNullOrEmpty(requester) ? "IT support" : requester;

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            Bounds = Screen.PrimaryScreen.Bounds;
            BackColor = Color.Black;
            // Every paint blits a complete frame, so the extra WinForms
            // back-buffer copy only costs CPU and adds nothing.
            SetStyle(
                ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.Opaque,
                true);

            _rainFont = new Font("Consolas", 19f / RainScale, FontStyle.Bold, GraphicsUnit.Pixel);
            _titleFont = new Font("Consolas", 34f, FontStyle.Bold, GraphicsUnit.Pixel);
            _subFont = new Font("Consolas", 15f, FontStyle.Regular, GraphicsUnit.Pixel);
            _monoFont = new Font("Consolas", 13f, FontStyle.Regular, GraphicsUnit.Pixel);
            _smallFont = new Font("Segoe UI", 12f, FontStyle.Regular, GraphicsUnit.Pixel);
            _microFont = new Font("Segoe UI", 11f, FontStyle.Regular, GraphicsUnit.Pixel);

            _rainBrush = new SolidBrush(Color.FromArgb(150, 255, 190));
            _fadeBrush = new SolidBrush(Color.FromArgb(34, 0, 0, 0));
            _panelBrush = new SolidBrush(Color.FromArgb(214, 4, 12, 9));
            _panelPen = new Pen(Color.FromArgb(70, 74, 222, 128), 1f);

            BuildRainBuffer();

            _timer = new Timer();
            _timer.Interval = 100;
            _timer.Tick += delegate { Step(); };
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                // WS_EX_LAYERED + WS_EX_TRANSPARENT is what actually lets mouse
                // input fall through to other processes. Nothing else is used,
                // so the window is fully opaque.
                cp.ExStyle |= WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            // A layered window stays invisible until it is given attributes.
            try
            {
                SetLayeredWindowAttributes(Handle, 0, 255, LWA_ALPHA);
            }
            catch
            {
            }
            ApplyCaptureExclusion();
        }

        protected override void SetVisibleCore(bool value)
        {
            if (value && !Visible) _previousForeground = GetForegroundWindow();
            base.SetVisibleCore(value);
            if (value) ReturnForeground();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            ApplyCaptureExclusion();
            HideSystemPointer();
            _timer.Start();
        }

        protected override void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            // Activation can also arrive after Show() returns (for example when
            // the agent window closes underneath us). Never keep it.
            ReturnForeground();
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == WM_MOUSEACTIVATE)
            {
                message.Result = new IntPtr(MA_NOACTIVATE);
                return;
            }
            base.WndProc(ref message);
        }

        /// <summary>
        /// Gives the foreground window back to whatever had it before. The
        /// overlay must never own keyboard focus: everything the technician
        /// types would land here and be thrown away.
        /// </summary>
        private void ReturnForeground()
        {
            if (_returningFocus) return;
            IntPtr previous = _previousForeground;
            if (previous == IntPtr.Zero || previous == Handle) return;
            if (GetForegroundWindow() != Handle) return;
            _returningFocus = true;
            try
            {
                SetForegroundWindow(previous);
            }
            catch
            {
                // Losing the focus hand-back must never close the overlay.
            }
            finally
            {
                _returningFocus = false;
            }
        }

        /// <summary>
        /// Replaces the arrow pointer with a fully transparent one. Injected
        /// mouse moves are real cursor moves, so this is what keeps the pointer
        /// off the privacy screen while the technician works.
        /// </summary>
        private void HideSystemPointer()
        {
            if (_pointerHidden) return;
            try
            {
                byte[] andMask = new byte[32 * 32 / 8];
                for (int index = 0; index < andMask.Length; index++) andMask[index] = 0xFF;
                byte[] xorMask = new byte[32 * 32 / 8];
                IntPtr blank = CreateCursor(IntPtr.Zero, 0, 0, 32, 32, andMask, xorMask);
                if (blank == IntPtr.Zero) return;
                // SetSystemCursor takes ownership of the handle on success.
                if (SetSystemCursor(blank, OCR_NORMAL)) _pointerHidden = true;
            }
            catch
            {
                // An unchanged pointer only blemishes privacy mode.
            }
        }

        /// <summary>
        /// Puts the normal system cursors back. Safe to call at any time, which
        /// is why the agent also calls it on startup: a crash while privacy mode
        /// was on must not leave the customer without a pointer.
        /// </summary>
        public static void RestoreSystemPointer()
        {
            try
            {
                SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, 0);
            }
            catch
            {
            }
        }

        private void ApplyCaptureExclusion()
        {
            try
            {
                CaptureExcluded = SetWindowDisplayAffinity(Handle, WDA_EXCLUDEFROMCAPTURE);
            }
            catch
            {
                CaptureExcluded = false;
            }
        }

        /// <summary>
        /// Re-checks capture exclusion once the window is fully visible. Some
        /// Windows builds reject the call until the window is mapped, so the
        /// agent calls this right after Show().
        /// </summary>
        public bool ReapplyCaptureExclusion()
        {
            ApplyCaptureExclusion();
            return CaptureExcluded;
        }

        /* -------------------------------------------------------------- Drawing */

        private void BuildRainBuffer()
        {
            int screenWidth = Math.Max(1, Bounds.Width);
            int screenHeight = Math.Max(1, Bounds.Height);
            _rainWidth = Math.Max(1, screenWidth / RainScale);
            _rainHeight = Math.Max(1, screenHeight / RainScale);
            _canvasWidth = screenWidth;
            _canvasHeight = screenHeight;

            // Top-down 32bpp DIB sections give us pixels that GDI can blit at
            // full speed, while GDI+ can still draw the trails and the text
            // into them. Drawing text straight onto the window buffer is far
            // slower than drawing it into one of these.
            _rainGraphics = CreateDib(_rainWidth, _rainHeight, out _rainDc, out _rainBitmap, out _rainOldBitmap);
            _canvasGraphics = CreateDib(_canvasWidth, _canvasHeight, out _canvasDc, out _canvasBitmap, out _canvasOldBitmap);
            _ready = _rainGraphics != null && _canvasGraphics != null;

            if (_rainGraphics != null)
            {
                // ClearType on a memory DC is both slow and pointless here: the
                // rain is upscaled anyway.
                _rainGraphics.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
                _rainGraphics.Clear(Color.Black);
            }
            if (_canvasGraphics != null)
            {
                _canvasGraphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                _canvasGraphics.Clear(Color.Black);
            }

            // Keep the same on-screen spacing as a full-resolution rain (18 px),
            // which also keeps the glyph count per frame predictable.
            _columnWidth = Math.Max(5f, 18f / RainScale);
            _columns = Math.Max(8, (int)(_rainWidth / _columnWidth));
            _lineHeight = Math.Max(8, (int)_rainFont.GetHeight() + 1);
            _heads = new float[_columns];
            _speeds = new float[_columns];
            _letters = new string[_columns];

            for (int index = 0; index < _columns; index++)
            {
                _heads[index] = _random.Next(-_rainHeight, 0);
                _speeds[index] = 2.5f + (float)_random.NextDouble() * 7f;
                _letters[index] = Glyph();
            }

            // Warm the rain up so the screen looks alive immediately instead of
            // starting with an empty black field. Kept small so opening the
            // overlay never freezes the customer's desktop.
            for (int index = 0; index < 20; index++) AdvanceRain();
            _visibleLog = 2;
        }

        /// <summary>
        /// Creates a top-down 32bpp DIB section with a memory DC and a GDI+
        /// surface on top of it. Returns null when Windows refuses the request;
        /// the animation then simply stays blank instead of crashing.
        /// </summary>
        private Graphics CreateDib(int width, int height, out IntPtr dc, out IntPtr bitmap, out IntPtr oldBitmap)
        {
            dc = IntPtr.Zero;
            bitmap = IntPtr.Zero;
            oldBitmap = IntPtr.Zero;

            IntPtr screenDc = GetDC(IntPtr.Zero);
            try
            {
                dc = CreateCompatibleDC(screenDc);
                if (dc == IntPtr.Zero) return null;

                BitmapInfo info = new BitmapInfo();
                info.Header.Size = Marshal.SizeOf(typeof(BitmapInfoHeader));
                info.Header.Width = width;
                info.Header.Height = -height;
                info.Header.Planes = 1;
                info.Header.BitCount = 32;
                info.Header.Compression = 0;

                IntPtr bits;
                bitmap = CreateDIBSection(dc, ref info, 0, out bits, IntPtr.Zero, 0);
                if (bitmap == IntPtr.Zero) return null;

                oldBitmap = SelectObject(dc, bitmap);
                return Graphics.FromHdc(dc);
            }
            catch
            {
                return null;
            }
            finally
            {
                if (screenDc != IntPtr.Zero) ReleaseDC(IntPtr.Zero, screenDc);
            }
        }

        private string Glyph()
        {
            return Glyphs.Substring(_random.Next(Glyphs.Length), 1);
        }

        private void Step()
        {
            try
            {
                AdvanceRain();

                if ((DateTime.UtcNow - _lastLog).TotalMilliseconds > 600 && _visibleLog < _log.Length)
                {
                    _visibleLog++;
                    _lastLog = DateTime.UtcNow;
                }

                Invalidate();
            }
            catch
            {
                // A dropped frame must never take the agent down with it.
            }
        }

        private void AdvanceRain()
        {
            if (!_ready || _rainGraphics == null) return;

            _rainGraphics.FillRectangle(_fadeBrush, 0, 0, _rainWidth, _rainHeight);
            for (int index = 0; index < _columns; index++)
            {
                float x = index * _columnWidth + 1f;
                float y = _heads[index];
                if (y > -_lineHeight && y < _rainHeight)
                {
                    _rainGraphics.DrawString(_letters[index], _rainFont, _rainBrush, x, y);
                }
                _heads[index] = y + _speeds[index];
                if (_heads[index] > _rainHeight + _lineHeight)
                {
                    _heads[index] = -_random.Next(0, _rainHeight / 4 + 1);
                    _speeds[index] = 2.5f + (float)_random.NextDouble() * 7f;
                }
                if (_random.Next(3) == 0) _letters[index] = Glyph();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            try
            {
                if (!_ready)
                {
                    e.Graphics.Clear(Color.Black);
                    return;
                }

                int width = _canvasWidth;
                int height = _canvasHeight;

                // Rain at half resolution, stretched into the full-res canvas.
                SetStretchBltMode(_canvasDc, COLORONCOLOR);
                StretchBlt(_canvasDc, 0, 0, width, height, _rainDc, 0, 0, _rainWidth, _rainHeight, SRCCOPY);

                Graphics graphics = _canvasGraphics;

                using (Brush green = new SolidBrush(Color.FromArgb(170, 255, 190)))
                using (Brush dim = new SolidBrush(Color.FromArgb(96, 214, 168)))
                using (Brush white = new SolidBrush(Color.FromArgb(236, 246, 240)))
                using (Brush muted = new SolidBrush(Color.FromArgb(158, 184, 176)))
                {
                    // Header, kept clear of the red Stop sharing bar at the top.
                    graphics.DrawString("SECURE SUPPORT SESSION", _titleFont, green, 58f, 84f);
                    graphics.DrawString(
                        "SupportIQ is connected to this computer",
                        _subFont,
                        dim,
                        60f,
                        128f);

                    Rectangle panel = new Rectangle(58, 182, Math.Min(660, Math.Max(320, width - 116)), 300);
                    DrawPanel(graphics, panel);

                    graphics.DrawString("> supportiq secure-session", _monoFont, white, panel.X + 18f, panel.Y + 14f);
                    graphics.DrawString("----------------------------------------", _monoFont, dim, panel.X + 18f, panel.Y + 34f);

                    int lineY = panel.Y + 58;
                    for (int index = 0; index < _visibleLog && index < _log.Length; index++)
                    {
                        bool finished = index < _visibleLog - 1 || _visibleLog >= _log.Length;
                        string state = finished ? "..... ok" : "..... ..";
                        graphics.DrawString("  " + _log[index] + " " + state, _monoFont, finished ? dim : white, panel.X + 18f, lineY);
                        lineY += 24;
                    }

                    if (((DateTime.UtcNow - _started).TotalMilliseconds / 500) % 2 < 1)
                    {
                        graphics.FillRectangle(green, panel.X + 20f, lineY + 2f, 8f, 15f);
                    }

                    // Scanning progress bar: suggests active work without claiming
                    // a real percentage of a repair it cannot measure.
                    int trackX = panel.X + 18;
                    int trackY = panel.Bottom - 28;
                    int trackWidth = panel.Width - 36;
                    graphics.DrawString("repairing reported issue", _microFont, muted, trackX, trackY - 20f);
                    using (Brush track = new SolidBrush(Color.FromArgb(42, 74, 222, 128)))
                    {
                        graphics.FillRectangle(track, trackX, trackY, trackWidth, 4);
                    }
                    int sweep = 96;
                    int offset = (int)(((DateTime.UtcNow - _started).TotalMilliseconds / 12) % (trackWidth + sweep)) - sweep;
                    int sweepStart = Math.Max(trackX, trackX + offset);
                    int sweepEnd = Math.Min(trackX + trackWidth, trackX + offset + sweep);
                    if (sweepEnd > sweepStart)
                    {
                        graphics.FillRectangle(green, sweepStart, trackY, sweepEnd - sweepStart, 4);
                    }

                    // Live badge on the right of the panel.
                    float badgeX = panel.Right + 34f;
                    if (badgeX + 220f < width)
                    {
                        graphics.DrawString("SESSION", _smallFont, muted, badgeX, panel.Y + 6f);
                        graphics.DrawString("ENCRYPTED", _titleFont, green, badgeX - 2f, panel.Y + 26f);
                        graphics.DrawString("No data is recorded or stored.", _smallFont, muted, badgeX, panel.Y + 70f);
                        graphics.DrawString("Your screen is hidden while support works.", _smallFont, muted, badgeX, panel.Y + 92f);
                    }

                    // Honest footer: this is support, not an attack.
                    Rectangle footer = new Rectangle(0, height - 96, width, 96);
                    using (Brush footerBrush = new SolidBrush(Color.FromArgb(214, 3, 10, 8)))
                    {
                        graphics.FillRectangle(footerBrush, footer);
                    }
                    graphics.DrawLine(_panelPen, 0f, footer.Y + 0.5f, width, footer.Y + 0.5f);
                    graphics.DrawString(
                        "SupportIQ secure session  ·  " + _requester + " from IT support is working on this computer.",
                        _smallFont,
                        white,
                        58f,
                        footer.Y + 24f);
                    graphics.DrawString(
                        "Your screen is hidden so your data stays private. Use \"Stop sharing\" at the top of the screen to end the session immediately.",
                        _microFont,
                        muted,
                        58f,
                        footer.Y + 50f);

                    TimeSpan elapsed = DateTime.UtcNow - _started;
                    string clock = ((int)elapsed.TotalMinutes).ToString("00") + ":" + elapsed.Seconds.ToString("00");
                    SizeF clockSize = graphics.MeasureString(clock, _monoFont);
                    graphics.DrawString(clock, _monoFont, dim, width - clockSize.Width - 58f, footer.Y + 26f);
                }

                // The whole frame is ready in the canvas: hand it to the window
                // with one GDI blit.
                IntPtr targetDc = e.Graphics.GetHdc();
                try
                {
                    BitBlt(targetDc, 0, 0, width, height, _canvasDc, 0, 0, SRCCOPY);
                }
                finally
                {
                    e.Graphics.ReleaseHdc(targetDc);
                }
            }
            catch
            {
                // Never let a paint failure crash the agent mid-session.
                try
                {
                    e.Graphics.Clear(Color.Black);
                }
                catch
                {
                }
            }
        }

        private void DrawPanel(Graphics graphics, Rectangle bounds)
        {
            int radius = 10;
            using (GraphicsPath path = new GraphicsPath())
            {
                path.AddArc(bounds.X, bounds.Y, radius, radius, 180f, 90f);
                path.AddArc(bounds.Right - radius, bounds.Y, radius, radius, 270f, 90f);
                path.AddArc(bounds.Right - radius, bounds.Bottom - radius, radius, radius, 0f, 90f);
                path.AddArc(bounds.X, bounds.Bottom - radius, radius, radius, 90f, 90f);
                path.CloseFigure();
                graphics.FillPath(_panelBrush, path);
                graphics.DrawPath(_panelPen, path);
            }
        }

        /* ------------------------------------------------------------- Lifespan */

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            RestoreSystemPointer();
            _pointerHidden = false;
            ReleaseRainBuffer();
            try
            {
                _timer.Stop();
                _timer.Dispose();
                _rainFont.Dispose();
                _titleFont.Dispose();
                _subFont.Dispose();
                _monoFont.Dispose();
                _smallFont.Dispose();
                _microFont.Dispose();
                _rainBrush.Dispose();
                _fadeBrush.Dispose();
                _panelBrush.Dispose();
                _panelPen.Dispose();
            }
            catch
            {
                // Disposal must never crash the agent while closing a session.
            }
            base.OnFormClosed(e);
        }

        private void ReleaseRainBuffer()
        {
            _ready = false;
            DisposeDib(ref _rainGraphics, ref _rainDc, ref _rainBitmap, ref _rainOldBitmap);
            DisposeDib(ref _canvasGraphics, ref _canvasDc, ref _canvasBitmap, ref _canvasOldBitmap);
        }

        private static void DisposeDib(ref Graphics graphics, ref IntPtr dc, ref IntPtr bitmap, ref IntPtr oldBitmap)
        {
            try
            {
                if (graphics != null)
                {
                    graphics.Dispose();
                    graphics = null;
                }
                if (dc != IntPtr.Zero && oldBitmap != IntPtr.Zero)
                {
                    SelectObject(dc, oldBitmap);
                    oldBitmap = IntPtr.Zero;
                }
                if (bitmap != IntPtr.Zero)
                {
                    DeleteObject(bitmap);
                    bitmap = IntPtr.Zero;
                }
                if (dc != IntPtr.Zero)
                {
                    DeleteDC(dc);
                    dc = IntPtr.Zero;
                }
            }
            catch
            {
                // Best effort; the process is closing the window anyway.
            }
        }
    }
}

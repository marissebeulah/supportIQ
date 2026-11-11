using System;
using System.Drawing;
using System.Windows.Forms;

namespace SupportIQ.Agent
{
    /// <summary>
    /// Always-on-screen indicator shown for the entire session. It never takes
    /// focus and includes an immediate Stop control plus a global hotkey.
    /// </summary>
    public class SessionForm : Form
    {
        private readonly AgentContext context;
        private readonly Label titleLabel;
        private readonly Label detailLabel;
        private readonly Button stopButton;
        private RemoteSessionDto session;
        private bool hotkeyRegistered;

        public SessionForm(AgentContext context, RemoteSessionDto session)
        {
            this.context = context;
            this.session = session;

            Text = "SupportIQ remote session";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            ClientSize = new Size(620, 72);
            BackColor = Color.FromArgb(18, 23, 27);

            Panel accent = new Panel();
            accent.Bounds = new Rectangle(0, 0, 6, 72);
            accent.BackColor = Color.FromArgb(226, 74, 54);
            Controls.Add(accent);

            Panel dot = new Panel();
            dot.Bounds = new Rectangle(22, 28, 14, 14);
            dot.BackColor = Color.FromArgb(226, 74, 54);
            Controls.Add(dot);

            titleLabel = new Label();
            titleLabel.ForeColor = Color.White;
            titleLabel.Font = new Font("Segoe UI Semibold", 10.5f, FontStyle.Bold);
            titleLabel.AutoSize = false;
            titleLabel.Bounds = new Rectangle(48, 14, 400, 22);
            Controls.Add(titleLabel);

            detailLabel = new Label();
            detailLabel.ForeColor = Color.FromArgb(168, 180, 188);
            detailLabel.Font = new Font("Segoe UI", 8.5f);
            detailLabel.AutoSize = false;
            detailLabel.Bounds = new Rectangle(48, 38, 400, 20);
            Controls.Add(detailLabel);

            stopButton = new Button();
            stopButton.Text = "Stop sharing";
            stopButton.Bounds = new Rectangle(470, 18, 132, 36);
            stopButton.BackColor = Color.FromArgb(226, 74, 54);
            stopButton.ForeColor = Color.White;
            stopButton.FlatStyle = FlatStyle.Flat;
            stopButton.FlatAppearance.BorderSize = 0;
            stopButton.Font = new Font("Segoe UI Semibold", 9.5f, FontStyle.Bold);
            stopButton.Click += delegate { StopRequested(); };
            Controls.Add(stopButton);

            UpdateSession(session);
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ExStyle |= 0x80; // WS_EX_TOOLWINDOW
                return parameters;
            }
        }

        public void UpdateSession(RemoteSessionDto value)
        {
            session = value;
            string requester = value != null && value.requestedBy != null ? value.requestedBy.name : "IT support";
            string reference = value != null && !string.IsNullOrEmpty(value.ticketRef) ? value.ticketRef : "support request";
            titleLabel.Text = requester + " is controlling this computer";
            detailLabel.Text = reference + " · visible session · Ctrl+Alt+Shift+F12 to stop";
            stopButton.Enabled = true;
            stopButton.Text = "Stop sharing";
        }

        private void StopRequested()
        {
            stopButton.Enabled = false;
            stopButton.Text = "Stopping…";
            detailLabel.Text = "Ending the remote session…";
            context.StopActiveSession();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Screen screen = Screen.PrimaryScreen ?? Screen.AllScreens[0];
            Rectangle area = screen.WorkingArea;
            Left = area.Left + (area.Width - Width) / 2;
            Top = area.Top + 14;
            try
            {
                hotkeyRegistered = NativeMethods.RegisterHotKey(
                    Handle,
                    1,
                    NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT,
                    NativeMethods.VK_F12);
            }
            catch
            {
                hotkeyRegistered = false;
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (hotkeyRegistered)
            {
                try
                {
                    NativeMethods.UnregisterHotKey(Handle, 1);
                }
                catch
                {
                    // Ignore.
                }
                hotkeyRegistered = false;
            }
            base.OnFormClosing(e);
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == NativeMethods.WM_HOTKEY && message.WParam.ToInt32() == 1)
            {
                StopRequested();
                return;
            }
            base.WndProc(ref message);
        }
    }
}

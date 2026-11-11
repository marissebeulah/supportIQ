using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace SupportIQ.Agent
{
    public class MainForm : Form
    {
        private readonly AgentContext context;
        private readonly TextBox serverBox;
        private readonly TextBox codeBox;
        private readonly TextBox nameBox;
        private readonly Button pairButton;
        private readonly Label statusLabel;
        private readonly Label pairedLabel;
        private readonly Label runtimeLabel;

        public MainForm(AgentContext context)
        {
            this.context = context;

            Text = "SupportIQ Agent";
            ClientSize = new Size(452, 452);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(247, 249, 248);
            Font = new Font("Segoe UI", 9f);

            Panel header = new Panel();
            header.Bounds = new Rectangle(0, 0, 452, 82);
            header.BackColor = Color.FromArgb(12, 74, 60);
            Controls.Add(header);

            Label title = new Label();
            title.Text = "SupportIQ Agent";
            title.ForeColor = Color.White;
            title.Font = new Font("Segoe UI Semibold", 15f, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(20, 16);
            header.Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "Visible, consent-based remote support for this PC.";
            subtitle.ForeColor = Color.FromArgb(190, 226, 213);
            subtitle.AutoSize = true;
            subtitle.Location = new Point(22, 48);
            header.Controls.Add(subtitle);

            Label intro = new Label();
            intro.Text = "Pair this computer once with the code shown in SupportIQ.";
            intro.ForeColor = Color.FromArgb(70, 84, 79);
            intro.AutoSize = false;
            intro.Bounds = new Rectangle(20, 96, 412, 22);
            Controls.Add(intro);

            Label serverLabel = MakeLabel("Server address", 20, 126);
            Controls.Add(serverLabel);
            serverBox = MakeTextBox(20, 146, 412);
            serverBox.Text = context.Config.ServerUrl;
            Controls.Add(serverBox);

            Label codeLabel = MakeLabel("Pairing code", 20, 184);
            Controls.Add(codeLabel);
            codeBox = MakeTextBox(20, 204, 240);
            codeBox.Font = new Font("Consolas", 14f, FontStyle.Bold);
            codeBox.CharacterCasing = CharacterCasing.Upper;
            codeBox.MaxLength = 12;
            Controls.Add(codeBox);

            Label nameLabel = MakeLabel("This computer's name", 20, 242);
            Controls.Add(nameLabel);
            nameBox = MakeTextBox(20, 262, 412);
            nameBox.Text = context.Config.DeviceName;
            Controls.Add(nameBox);

            pairButton = new Button();
            pairButton.Text = "Pair this computer";
            pairButton.Bounds = new Rectangle(20, 306, 412, 38);
            pairButton.BackColor = Color.FromArgb(16, 110, 88);
            pairButton.ForeColor = Color.White;
            pairButton.FlatStyle = FlatStyle.Flat;
            pairButton.FlatAppearance.BorderSize = 0;
            pairButton.Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold);
            pairButton.Click += PairClicked;
            Controls.Add(pairButton);

            statusLabel = new Label();
            statusLabel.Bounds = new Rectangle(20, 352, 412, 40);
            statusLabel.ForeColor = Color.FromArgb(95, 108, 103);
            statusLabel.Font = new Font("Segoe UI", 9f);
            Controls.Add(statusLabel);

            pairedLabel = new Label();
            pairedLabel.Bounds = new Rectangle(20, 394, 412, 20);
            pairedLabel.ForeColor = Color.FromArgb(16, 110, 88);
            pairedLabel.Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold);
            Controls.Add(pairedLabel);

            runtimeLabel = new Label();
            runtimeLabel.Bounds = new Rectangle(20, 416, 412, 22);
            runtimeLabel.ForeColor = Color.FromArgb(120, 132, 127);
            runtimeLabel.Font = new Font("Segoe UI", 8.5f);
            runtimeLabel.Text = "Remote access always requires your approval.";
            Controls.Add(runtimeLabel);

            UpdatePairedState();
        }

        public AgentContext Context
        {
            get { return context; }
        }

        private static Label MakeLabel(string text, int x, int y)
        {
            Label label = new Label();
            label.Text = text;
            label.ForeColor = Color.FromArgb(70, 84, 79);
            label.Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold);
            label.AutoSize = true;
            label.Location = new Point(x, y);
            return label;
        }

        private static TextBox MakeTextBox(int x, int y, int width)
        {
            TextBox box = new TextBox();
            box.Bounds = new Rectangle(x, y, width, 28);
            box.Font = new Font("Segoe UI", 10f);
            box.BorderStyle = BorderStyle.FixedSingle;
            return box;
        }

        public void Prefill(string code, string message)
        {
            if (!string.IsNullOrEmpty(code)) codeBox.Text = FormatCode(code);
            if (!string.IsNullOrEmpty(message)) SetStatus(message, true);
            UpdatePairedState();
        }

        public void SetRuntimeStatus(string text)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(SetRuntimeStatus), text);
                return;
            }
            runtimeLabel.Text = text;
        }

        private void UpdatePairedState()
        {
            if (context.Config.HasToken)
            {
                string who = string.IsNullOrEmpty(context.Config.UserName) ? "this account" : context.Config.UserName;
                pairedLabel.Text = "Paired as " + who + " · " + context.Config.DeviceName;
                pairButton.Text = "Pair again with a new code";
            }
            else
            {
                pairedLabel.Text = "";
                pairButton.Text = "Pair this computer";
            }
        }

        private static string NormalizeCode(string value)
        {
            string text = (value ?? "").ToUpperInvariant();
            char[] buffer = new char[text.Length];
            int count = 0;
            foreach (char ch in text)
            {
                if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) buffer[count++] = ch;
            }
            return new string(buffer, 0, count);
        }

        private static string FormatCode(string value)
        {
            string normalized = NormalizeCode(value);
            if (normalized.Length > 4) return normalized.Substring(0, 4) + "-" + normalized.Substring(4);
            return normalized;
        }

        private void PairClicked(object sender, EventArgs e)
        {
            string server = serverBox.Text.Trim();
            string code = NormalizeCode(codeBox.Text);
            string name = nameBox.Text.Trim();
            if (name.Length == 0) name = Environment.MachineName;
            if (code.Length != 8)
            {
                SetStatus("Enter the 8-character code shown in SupportIQ.", true);
                codeBox.Focus();
                return;
            }

            SetBusy(true);
            SetStatus("Pairing this computer…", false);

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    PairResult result = context.Pair(server, code, name);
                    context.Post(delegate
                    {
                        SetBusy(false);
                        UpdatePairedState();
                        SetStatus("Paired successfully. This window can stay in the tray.", false);
                        context.RestartRuntime();
                        context.ShowBalloon("SupportIQ Agent", "This computer is paired. IT support can now request access.");
                        Hide();
                    });
                }
                catch (Exception error)
                {
                    string message = error.Message;
                    context.Post(delegate
                    {
                        SetBusy(false);
                        SetStatus(message, true);
                    });
                }
            });
        }

        private void SetBusy(bool busy)
        {
            pairButton.Enabled = !busy;
            pairButton.Text = busy ? "Pairing…" : "Pair this computer";
            serverBox.Enabled = !busy;
            codeBox.Enabled = !busy;
            nameBox.Enabled = !busy;
        }

        private void SetStatus(string message, bool error)
        {
            statusLabel.Text = message;
            statusLabel.ForeColor = error
                ? Color.FromArgb(168, 51, 31)
                : Color.FromArgb(95, 108, 103);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!context.Exiting && context.Config.HasToken)
            {
                e.Cancel = true;
                Hide();
                context.ShowBalloon("SupportIQ Agent", "Still running in the notification area.");
                return;
            }
            base.OnFormClosing(e);
        }
    }

    public class PairResult
    {
        public string UserName;
        public string DeviceName;
    }
}

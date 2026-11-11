using System;
using System.Drawing;
using System.Media;
using System.Windows.Forms;

namespace SupportIQ.Agent
{
    /// <summary>
    /// The single consent point. Nothing is captured or injected until the
    /// customer presses Allow here.
    /// </summary>
    public class PromptForm : Form
    {
        private readonly RemoteSessionDto session;
        private readonly Label countdownLabel;
        private readonly Timer countdown;
        private int secondsLeft;

        public PromptForm(RemoteSessionDto session)
        {
            this.session = session;
            secondsLeft = 30;

            Text = "Remote support request";
            ClientSize = new Size(468, 330);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;
            ShowInTaskbar = true;
            BackColor = Color.FromArgb(250, 248, 244);
            Font = new Font("Segoe UI", 9f);

            Panel header = new Panel();
            header.Bounds = new Rectangle(0, 0, 468, 92);
            header.BackColor = Color.FromArgb(150, 88, 10);
            Controls.Add(header);

            Label eyebrow = new Label();
            eyebrow.Text = "REMOTE SUPPORT REQUEST";
            eyebrow.ForeColor = Color.FromArgb(250, 226, 180);
            eyebrow.Font = new Font("Segoe UI Semibold", 8f, FontStyle.Bold);
            eyebrow.AutoSize = true;
            eyebrow.Location = new Point(22, 16);
            header.Controls.Add(eyebrow);

            string requester = session.requestedBy != null ? session.requestedBy.name : "IT support";
            Label title = new Label();
            title.Text = requester + " wants to control this computer";
            title.ForeColor = Color.White;
            title.Font = new Font("Segoe UI Semibold", 14f, FontStyle.Bold);
            title.AutoSize = false;
            title.Bounds = new Rectangle(22, 38, 424, 46);
            header.Controls.Add(title);

            Label body = new Label();
            body.Text = "They will be able to see this screen and use your mouse and keyboard. "
                + "A red bar stays on screen while the session is active, and you can stop at any time.";
            body.ForeColor = Color.FromArgb(72, 78, 74);
            body.Font = new Font("Segoe UI", 10f);
            body.AutoSize = false;
            body.Bounds = new Rectangle(22, 110, 424, 62);
            Controls.Add(body);

            Label ticket = new Label();
            ticket.Text = string.IsNullOrEmpty(session.ticketRef)
                ? "Support request"
                : "Support request " + session.ticketRef;
            ticket.ForeColor = Color.FromArgb(120, 128, 123);
            ticket.Font = new Font("Segoe UI", 9f);
            ticket.AutoSize = true;
            ticket.Location = new Point(22, 180);
            Controls.Add(ticket);

            Label safety = new Label();
            safety.Text = "Only allow this if you asked SupportIQ for help and you recognize this person.";
            safety.ForeColor = Color.FromArgb(150, 88, 10);
            safety.Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold);
            safety.AutoSize = false;
            safety.Bounds = new Rectangle(22, 204, 424, 38);
            Controls.Add(safety);

            Button allow = new Button();
            allow.Text = "Allow remote control";
            allow.Bounds = new Rectangle(22, 256, 220, 42);
            allow.BackColor = Color.FromArgb(16, 110, 88);
            allow.ForeColor = Color.White;
            allow.FlatStyle = FlatStyle.Flat;
            allow.FlatAppearance.BorderSize = 0;
            allow.Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold);
            allow.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };
            Controls.Add(allow);

            Button deny = new Button();
            deny.Text = "Don't allow";
            deny.Bounds = new Rectangle(252, 256, 194, 42);
            deny.BackColor = Color.FromArgb(238, 238, 234);
            deny.ForeColor = Color.FromArgb(60, 68, 64);
            deny.FlatStyle = FlatStyle.Flat;
            deny.FlatAppearance.BorderColor = Color.FromArgb(210, 210, 204);
            deny.Font = new Font("Segoe UI", 10f);
            deny.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };
            Controls.Add(deny);

            countdownLabel = new Label();
            countdownLabel.Bounds = new Rectangle(22, 304, 424, 18);
            countdownLabel.ForeColor = Color.FromArgb(130, 136, 132);
            countdownLabel.Font = new Font("Segoe UI", 8.5f);
            countdownLabel.Text = "This request expires in 30 seconds.";
            Controls.Add(countdownLabel);

            countdown = new Timer();
            countdown.Interval = 1000;
            countdown.Tick += CountdownTick;
            countdown.Start();

            CancelButton = deny;
            FormClosing += delegate { countdown.Stop(); };
        }

        public RemoteSessionDto Session
        {
            get { return session; }
        }

        private void CountdownTick(object sender, EventArgs e)
        {
            secondsLeft -= 1;
            if (secondsLeft <= 0)
            {
                countdown.Stop();
                DialogResult = DialogResult.Cancel;
                Close();
                return;
            }
            countdownLabel.Text = "This request expires in " + secondsLeft + " seconds.";
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            try
            {
                SystemSounds.Exclamation.Play();
            }
            catch
            {
                // Sound is optional.
            }
            Activate();
            BringToFront();
        }
    }
}

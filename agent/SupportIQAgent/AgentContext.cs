using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace SupportIQ.Agent
{
    /// <summary>Owns the tray icon, windows and the active runtime.</summary>
    public class AgentContext : ApplicationContext
    {
        private readonly AgentConfig config;
        private readonly Control marshal;
        private AgentRuntime runtime;
        private MainForm mainForm;
        private SessionForm sessionForm;
        private NotifyIcon tray;
        private ToolStripMenuItem stopItem;
        private bool promptOpen;
        private bool exiting;

        public AgentContext(AgentConfig config)
        {
            this.config = config;

            // A hidden control gives us a reliable UI thread for callbacks from
            // the polling and capture threads.
            marshal = new Control();
            IntPtr handle = marshal.Handle;

            CreateTray();
        }

        public AgentConfig Config
        {
            get { return config; }
        }

        public bool Exiting
        {
            get { return exiting; }
        }

        /* ------------------------------------------------------------- Startup */

        public void Start(string[] args)
        {
            string server;
            string code;
            Program.ParseArguments(args, out server, out code);
            if (!string.IsNullOrEmpty(server))
            {
                config.ServerUrl = HttpApi.NormalizeBaseUrl(server);
            }

            if (config.HasToken)
            {
                StartRuntime();
                SetTray("SupportIQ Agent — ready", false);
                ShowBalloon("SupportIQ Agent", "This computer is paired. IT support can request access.");
                if (!string.IsNullOrEmpty(code)) ShowMainForm(code, "Enter this code to pair this computer again.");
            }
            else
            {
                ShowMainForm(code, null);
            }
        }

        /* ------------------------------------------------------------- Pairing */

        public PairResult Pair(string server, string code, string deviceName)
        {
            string baseUrl = HttpApi.NormalizeBaseUrl(server);
            HttpApi api = new HttpApi(baseUrl, null);
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["code"] = code;
            body["deviceName"] = deviceName;
            body["platform"] = "windows";
            body["agentVersion"] = "1.0.0";

            PairResponse response = api.PostJson<PairResponse>("/api/agent/pair", body, 25000);
            if (response == null || string.IsNullOrEmpty(response.token))
            {
                throw new InvalidOperationException("The server didn't return a device token.");
            }

            config.ServerUrl = HttpApi.NormalizeBaseUrl(
                string.IsNullOrEmpty(response.serverUrl) ? baseUrl : response.serverUrl);
            config.SetToken(response.token);
            if (response.device != null)
            {
                config.DeviceId = response.device.id;
                config.DeviceName = response.device.name;
            }
            if (response.user != null) config.UserName = response.user.name;
            config.Save();

            PairResult result = new PairResult();
            result.UserName = config.UserName;
            result.DeviceName = config.DeviceName;
            return result;
        }

        public void RestartRuntime()
        {
            StopRuntime();
            StartRuntime();
        }

        private void StartRuntime()
        {
            if (exiting || runtime != null || !config.HasToken) return;
            runtime = new AgentRuntime(config, this);
            runtime.Start();
            SetTray("SupportIQ Agent — ready", false);
            SetMainStatus("Ready for remote support requests.");
        }

        private void StopRuntime()
        {
            if (runtime == null) return;
            runtime.Dispose();
            runtime = null;
        }

        /* ------------------------------------------------------- Agent callbacks */

        public void OnSessionInvite(RemoteSessionDto session)
        {
            Post(delegate
            {
                if (exiting || promptOpen || session == null) return;
                promptOpen = true;
                try
                {
                    using (PromptForm form = new PromptForm(session))
                    {
                        DialogResult result = form.ShowDialog();
                        promptOpen = false;
                        if (runtime != null) runtime.SendAnswer(session.id, result == DialogResult.OK);
                    }
                }
                catch
                {
                    promptOpen = false;
                }
            });
        }

        public void OnSessionActive(RemoteSessionDto session)
        {
            Post(delegate
            {
                if (exiting || session == null) return;
                string requester = session.requestedBy != null ? session.requestedBy.name : "IT support";
                SetTray("SupportIQ Agent — remote session active", true);
                if (stopItem != null) stopItem.Enabled = true;
                if (sessionForm == null || sessionForm.IsDisposed)
                {
                    sessionForm = new SessionForm(this, session);
                    sessionForm.Show();
                }
                else
                {
                    sessionForm.UpdateSession(session);
                }
                SetMainStatus("Remote session active with " + requester + ".");
            });
        }

        public void OnSessionEnded(string sessionId)
        {
            Post(delegate
            {
                SetTray("SupportIQ Agent — ready", false);
                if (stopItem != null) stopItem.Enabled = false;
                if (sessionForm != null)
                {
                    sessionForm.Close();
                    sessionForm.Dispose();
                    sessionForm = null;
                }
                SetMainStatus("Ready for remote support requests.");
            });
        }

        public void OnSessionDeclined()
        {
            ShowBalloon("SupportIQ Agent", "The remote request was declined. Nothing was shared.");
        }

        public void OnAnswerFailed(string message)
        {
            Post(delegate
            {
                SetTray("SupportIQ Agent — ready", false);
                SetMainStatus("The request could not be answered: " + message);
                ShowBalloon("Remote request", message);
            });
        }

        public void OnPairingLost()
        {
            Post(delegate
            {
                config.SetToken(null);
                config.Save();
                StopRuntime();
                SetTray("SupportIQ Agent — not paired", false);
                if (stopItem != null) stopItem.Enabled = false;
                if (sessionForm != null)
                {
                    sessionForm.Close();
                    sessionForm.Dispose();
                    sessionForm = null;
                }
                ShowMainForm(null, "This computer needs to be paired again. Generate a fresh code in SupportIQ.");
            });
        }

        /* ------------------------------------------------------------- UI helpers */

        public void Post(Action action)
        {
            if (exiting) return;
            try
            {
                if (marshal.InvokeRequired) marshal.BeginInvoke(action);
                else action();
            }
            catch
            {
                // The app is shutting down.
            }
        }

        public void ShowMainForm(string code, string message)
        {
            Post(delegate
            {
                if (exiting) return;
                if (mainForm == null || mainForm.IsDisposed) mainForm = new MainForm(this);
                mainForm.Prefill(code, message);
                if (!mainForm.Visible) mainForm.Show();
                if (mainForm.WindowState == FormWindowState.Minimized)
                {
                    mainForm.WindowState = FormWindowState.Normal;
                }
                mainForm.Activate();
                mainForm.BringToFront();
            });
        }

        public void ShowBalloon(string title, string text)
        {
            Post(delegate
            {
                if (tray == null) return;
                try
                {
                    tray.BalloonTipTitle = title;
                    tray.BalloonTipText = text;
                    tray.BalloonTipIcon = ToolTipIcon.Info;
                    tray.ShowBalloonTip(4000);
                }
                catch
                {
                    // Notifications are optional.
                }
            });
        }

        public void StopActiveSession()
        {
            if (runtime != null) runtime.StopActiveSession();
            else OnSessionEnded(null);
        }

        public void ExitAgent()
        {
            if (exiting) return;
            exiting = true;
            StopRuntime();
            if (sessionForm != null)
            {
                sessionForm.Close();
                sessionForm.Dispose();
                sessionForm = null;
            }
            if (mainForm != null)
            {
                mainForm.Close();
                mainForm.Dispose();
                mainForm = null;
            }
            if (tray != null)
            {
                tray.Visible = false;
                tray.Dispose();
                tray = null;
            }
            ExitThread();
        }

        private void SetMainStatus(string text)
        {
            if (mainForm != null && !mainForm.IsDisposed) mainForm.SetRuntimeStatus(text);
        }

        private void SetTray(string text, bool active)
        {
            if (tray == null) return;
            try
            {
                tray.Text = text.Length > 62 ? text.Substring(0, 62) : text;
                tray.Icon = active ? SystemIcons.Error : SystemIcons.Shield;
            }
            catch
            {
                // Ignore tray errors on locked-down systems.
            }
        }

        private void CreateTray()
        {
            tray = new NotifyIcon();
            tray.Icon = SystemIcons.Shield;
            tray.Text = "SupportIQ Agent";
            tray.Visible = true;

            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem openItem = new ToolStripMenuItem("Open SupportIQ Agent");
            openItem.Click += delegate { ShowMainForm(null, null); };
            menu.Items.Add(openItem);

            stopItem = new ToolStripMenuItem("Stop remote session");
            stopItem.Enabled = false;
            stopItem.Click += delegate { StopActiveSession(); };
            menu.Items.Add(stopItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("Exit");
            exitItem.Click += delegate { ExitAgent(); };
            menu.Items.Add(exitItem);

            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { ShowMainForm(null, null); };
        }
    }
}

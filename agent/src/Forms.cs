using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace SupportIQ
{
    /// <summary>
    /// The visible agent window. IT support sends a request, the customer allows it
    /// here, and frames plus input commands flow through the SupportIQ API.
    /// </summary>
    internal sealed class AgentForm : Form
    {
        private const int MaxFrameWidth = 1600;
        private const int FrameIntervalMs = 110;

        private readonly AppConfig _config;
        private readonly string _pendingServer;
        private readonly string _pendingCode;

        private AgentApi _api;
        private Thread _pollThread;
        private Thread _captureThread;
        private Thread _updateThread;
        private long _activeSessionId;
        private volatile bool _running;
        private volatile bool _pairing;
        private bool _quitting;
        private volatile bool _consentOpen;
        private string _localHash;
        private int _failures;
        private DateTime _fallbackAttempt = DateTime.MinValue;

        private Panel _pairPanel;
        private Panel _pairedPanel;
        private TextBox _serverBox;
        private TextBox _codeBox;
        private Button _pairButton;
        private Label _pairStatus;
        private Label _deviceLabel;
        private Label _serverLabel;
        private Button _serverEditButton;
        private Panel _serverEditPanel;
        private TextBox _serverUrlBox;
        private Button _serverSaveButton;
        private Label _serverEditStatus;
        private Label _hintLabel;
        private volatile bool _savingServer;
        private Label _statusLabel;
        private CheckBox _autoStartBox;
        private NotifyIcon _tray;
        private ActiveBarForm _bar;
        private PrivacyScreenForm _privacy;
        private volatile bool _privacyUnavailable;
        private System.Windows.Forms.Timer _pendingTimer;
        private bool _trayHintShown;

        public AgentForm(AppConfig config, string pendingServer, string pendingCode)
        {
            _config = config;
            _pendingServer = pendingServer;
            _pendingCode = pendingCode;

            Text = "SupportIQ Agent";
            ClientSize = new Size(520, 438);
            MinimumSize = new Size(536, 477);
            MaximumSize = new Size(536, 477);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            Font = new Font("Segoe UI", 9F);
            Icon = SystemIcons.Application;

            BuildUi();
            BuildTray();
            BuildPendingTimer();

            if (_config.IsPaired) ShowPaired();
            else ShowPairing("");
        }

        /* ------------------------------------------------------------------ UI */

        private void BuildUi()
        {
            Label title = MakeLabel("SupportIQ Agent", 24, 18, 460, 32, 16F, FontStyle.Bold, Color.FromArgb(15, 23, 42));
            Controls.Add(title);

            Label subtitle = MakeLabel("Remote support for this computer", 24, 50, 460, 22, 9.5F, FontStyle.Regular, Color.FromArgb(100, 116, 139));
            Controls.Add(subtitle);

            /* Pairing ------------------------------------------------------- */
            _pairPanel = new Panel();
            _pairPanel.Location = new Point(0, 0);
            _pairPanel.Size = new Size(520, 340);
            _pairPanel.BackColor = Color.Transparent;
            Controls.Add(_pairPanel);

            Label pairHelp = MakeLabel(
                "Enter the pairing code shown in the SupportIQ portal. This PC stays paired until you forget it here or in the portal.",
                24, 84, 460, 44, 9.5F, FontStyle.Regular, Color.FromArgb(71, 85, 105));
            _pairPanel.Controls.Add(pairHelp);

            Label serverCaption = MakeLabel("Server address", 24, 138, 200, 18, 8.5F, FontStyle.Bold, Color.FromArgb(100, 116, 139));
            _pairPanel.Controls.Add(serverCaption);

            _serverBox = new TextBox();
            _serverBox.Location = new Point(24, 158);
            _serverBox.Size = new Size(460, 26);
            _serverBox.Text = "http://localhost:3001";
            _pairPanel.Controls.Add(_serverBox);

            Label codeCaption = MakeLabel("Pairing code", 24, 202, 200, 18, 8.5F, FontStyle.Bold, Color.FromArgb(100, 116, 139));
            _pairPanel.Controls.Add(codeCaption);

            _codeBox = new TextBox();
            _codeBox.Location = new Point(24, 222);
            _codeBox.Size = new Size(190, 34);
            _codeBox.Font = new Font("Consolas", 15F, FontStyle.Bold);
            _codeBox.MaxLength = 9;
            _codeBox.CharacterCasing = CharacterCasing.Upper;
            _pairPanel.Controls.Add(_codeBox);

            _pairButton = new Button();
            _pairButton.Text = "Pair this PC";
            _pairButton.Location = new Point(232, 222);
            _pairButton.Size = new Size(150, 36);
            _pairButton.FlatStyle = FlatStyle.System;
            _pairButton.Click += PairClicked;
            _pairPanel.Controls.Add(_pairButton);

            _pairStatus = MakeLabel("", 24, 274, 460, 80, 9F, FontStyle.Regular, Color.FromArgb(185, 28, 28));
            _pairPanel.Controls.Add(_pairStatus);

            /* Paired -------------------------------------------------------- */
            _pairedPanel = new Panel();
            _pairedPanel.Location = new Point(0, 0);
            _pairedPanel.Size = new Size(520, 340);
            _pairedPanel.BackColor = Color.Transparent;
            _pairedPanel.Visible = false;
            Controls.Add(_pairedPanel);

            _deviceLabel = MakeLabel("", 24, 88, 460, 28, 13F, FontStyle.Bold, Color.FromArgb(15, 23, 42));
            _pairedPanel.Controls.Add(_deviceLabel);

            _serverLabel = MakeLabel("", 24, 116, 366, 20, 9F, FontStyle.Regular, Color.FromArgb(100, 116, 139));
            _serverLabel.AutoEllipsis = true;
            _pairedPanel.Controls.Add(_serverLabel);

            _serverEditButton = new Button();
            _serverEditButton.Text = "Change address";
            _serverEditButton.Location = new Point(388, 112);
            _serverEditButton.Size = new Size(108, 26);
            _serverEditButton.FlatStyle = FlatStyle.System;
            _serverEditButton.Click += delegate { ShowServerEditor(); };
            _pairedPanel.Controls.Add(_serverEditButton);

            _statusLabel = MakeLabel("", 24, 156, 460, 28, 11F, FontStyle.Bold, Color.FromArgb(71, 85, 105));
            _pairedPanel.Controls.Add(_statusLabel);

            _hintLabel = MakeLabel(
                "IT support can only connect after you click Allow. A red bar stays at the top of the screen while they are connected, and Stop sharing disconnects instantly.",
                24, 192, 460, 58, 9F, FontStyle.Regular, Color.FromArgb(100, 116, 139));
            _pairedPanel.Controls.Add(_hintLabel);

            /* Manual server address — used when the host's address changed and
               the automatic fallback could not be reached either. */
            _serverEditPanel = new Panel();
            _serverEditPanel.Location = new Point(24, 186);
            _serverEditPanel.Size = new Size(472, 100);
            _serverEditPanel.BackColor = Color.Transparent;
            _serverEditPanel.Visible = false;
            _pairedPanel.Controls.Add(_serverEditPanel);

            Label addressCaption = MakeLabel("Server address", 0, 0, 200, 18, 8.5F, FontStyle.Bold, Color.FromArgb(100, 116, 139));
            _serverEditPanel.Controls.Add(addressCaption);

            _serverUrlBox = new TextBox();
            _serverUrlBox.Location = new Point(0, 20);
            _serverUrlBox.Size = new Size(330, 26);
            _serverEditPanel.Controls.Add(_serverUrlBox);

            _serverSaveButton = new Button();
            _serverSaveButton.Text = "Save";
            _serverSaveButton.Location = new Point(338, 19);
            _serverSaveButton.Size = new Size(62, 28);
            _serverSaveButton.FlatStyle = FlatStyle.System;
            _serverSaveButton.Click += SaveServerClicked;
            _serverEditPanel.Controls.Add(_serverSaveButton);

            Button cancelAddress = new Button();
            cancelAddress.Text = "Cancel";
            cancelAddress.Location = new Point(406, 19);
            cancelAddress.Size = new Size(66, 28);
            cancelAddress.FlatStyle = FlatStyle.System;
            cancelAddress.Click += delegate { CloseServerEditor(); };
            _serverEditPanel.Controls.Add(cancelAddress);

            _serverEditStatus = MakeLabel("", 0, 56, 472, 42, 8.5F, FontStyle.Regular, Color.FromArgb(185, 28, 28));
            _serverEditPanel.Controls.Add(_serverEditStatus);

            _autoStartBox = new CheckBox();
            _autoStartBox.Text = "Start the agent when I sign in to Windows";
            _autoStartBox.Location = new Point(24, 256);
            _autoStartBox.Size = new Size(400, 24);
            _autoStartBox.Checked = _config.AutoStart;
            _autoStartBox.CheckedChanged += AutoStartChanged;
            _pairedPanel.Controls.Add(_autoStartBox);

            Button unpair = new Button();
            unpair.Text = "Forget this PC";
            unpair.Location = new Point(24, 292);
            unpair.Size = new Size(160, 34);
            unpair.FlatStyle = FlatStyle.System;
            unpair.Click += UnpairClicked;
            _pairedPanel.Controls.Add(unpair);

            Label footer = MakeLabel(
                "Approved sessions only. Screen frames and input are relayed live and discarded — nothing is recorded or saved.",
                24, 356, 460, 58, 8.5F, FontStyle.Regular, Color.FromArgb(148, 163, 184));
            Controls.Add(footer);
        }

        private static Label MakeLabel(string text, int x, int y, int width, int height, float size, FontStyle style, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Location = new Point(x, y);
            label.Size = new Size(width, height);
            label.Font = new Font("Segoe UI", size, style);
            label.ForeColor = color;
            label.BackColor = Color.Transparent;
            return label;
        }

        private void BuildTray()
        {
            _tray = new NotifyIcon();
            _tray.Icon = SystemIcons.Application;
            _tray.Text = "SupportIQ Agent";
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open SupportIQ Agent", null, delegate { Restore(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit", null, delegate { Quit(); });
            _tray.ContextMenuStrip = menu;
            _tray.DoubleClick += delegate { Restore(); };
            _tray.Visible = true;
        }

        private void BuildPendingTimer()
        {
            _pendingTimer = new System.Windows.Forms.Timer();
            _pendingTimer.Interval = 2000;
            _pendingTimer.Tick += delegate { ConsumePendingPair(); };
            _pendingTimer.Start();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Log.Write("Window shown (paired: " + _config.IsPaired + ")");
            if (_config.IsPaired)
            {
                StartAgent();
                return;
            }
            if (!string.IsNullOrEmpty(_pendingServer) && !string.IsNullOrEmpty(_pendingCode))
            {
                _serverBox.Text = _pendingServer;
                _codeBox.Text = _pendingCode;
                StartPairing(_pendingServer, _pendingCode);
                return;
            }
            ConsumePendingPair();
        }

        private void ShowPairing(string message)
        {
            _running = false;
            _pairPanel.Visible = true;
            _pairedPanel.Visible = false;
            _pairStatus.Text = message ?? "";
        }

        private void ShowPaired()
        {
            _pairPanel.Visible = false;
            _pairedPanel.Visible = true;
            _deviceLabel.Text = string.IsNullOrEmpty(_config.DeviceName) ? Environment.MachineName : _config.DeviceName;
            _serverLabel.Text = "Paired with " + _config.ServerUrl;
            CloseServerEditor();
            _autoStartBox.Checked = _config.AutoStart;
            SetStatus("Connecting to SupportIQ…", false);
        }

        /* ------------------------------------------------------ Server address */

        private void ShowServerEditor()
        {
            if (_serverEditPanel == null) return;
            _serverUrlBox.Text = _config.ServerUrl;
            _serverEditStatus.Text = Interlocked.Read(ref _activeSessionId) != 0
                ? "End the remote session before changing the address."
                : "";
            _serverEditPanel.Visible = true;
            _hintLabel.Visible = false;
            // The editor sits over the auto-start row; hide it while open.
            _autoStartBox.Visible = false;
            if (Interlocked.Read(ref _activeSessionId) == 0)
            {
                _serverUrlBox.Focus();
                _serverUrlBox.SelectAll();
            }
        }

        private void CloseServerEditor()
        {
            if (_serverEditPanel == null) return;
            _serverEditPanel.Visible = false;
            if (_hintLabel != null) _hintLabel.Visible = true;
            if (_autoStartBox != null) _autoStartBox.Visible = true;
            _serverEditStatus.Text = "";
        }

        private void SaveServerClicked(object sender, EventArgs e)
        {
            if (_savingServer) return;
            string url = AppConfig.NormalizeServer(_serverUrlBox.Text);
            if (url.Length == 0)
            {
                _serverEditStatus.Text = "Enter an address like http://192.168.1.27:3001.";
                return;
            }
            if (Interlocked.Read(ref _activeSessionId) != 0)
            {
                _serverEditStatus.Text = "End the remote session before changing the address.";
                return;
            }
            if (string.Equals(url, _config.ServerUrl, StringComparison.OrdinalIgnoreCase))
            {
                CloseServerEditor();
                return;
            }

            _savingServer = true;
            _serverSaveButton.Enabled = false;
            _serverEditStatus.Text = "Checking " + url + "…";
            string token = _config.Token;
            Thread thread = new Thread(new ThreadStart(delegate { SaveServerWorker(url, token); }));
            thread.IsBackground = true;
            thread.Start();
        }

        /// <summary>
        /// Only keeps the typed address when the server answers with this PC's
        /// device token, so a typo never leaves the agent unable to reconnect.
        /// </summary>
        private void SaveServerWorker(string url, string token)
        {
            string message;
            try
            {
                AgentApi candidate = new AgentApi(url, token);
                candidate.Poll(0, 0);
                string previous = _config.ServerUrl;
                _config.ServerUrl = candidate.ServerUrl;
                _config.FallbackServerUrl = previous;
                _config.Save();
                _api = candidate;
                _failures = 0;
                Log.Write("Server address changed to " + _config.ServerUrl);
                Ui(delegate
                {
                    _savingServer = false;
                    _serverSaveButton.Enabled = true;
                    CloseServerEditor();
                    _serverLabel.Text = "Paired with " + _config.ServerUrl;
                    SetStatus("Connected — waiting for support requests", false);
                });
                return;
            }
            catch (AgentApiException error)
            {
                message = error.Status == 401
                    ? "That server answered, but it rejected this PC's pairing. Generate a new pairing code in SupportIQ."
                    : "Nothing answered at that address. Check it and that SupportIQ is running.";
            }
            catch (Exception error)
            {
                message = "Couldn't use that address: " + error.Message;
            }

            Log.Write("Server address change failed: " + message);
            Ui(delegate
            {
                _savingServer = false;
                _serverSaveButton.Enabled = true;
                _serverEditStatus.Text = message;
            });
        }

        private void SetStatus(string text, bool live)
        {
            if (_statusLabel == null) return;
            _statusLabel.Text = text;
            _statusLabel.ForeColor = live ? Color.FromArgb(21, 128, 61) : Color.FromArgb(71, 85, 105);
        }

        /// <summary>
        /// NotifyIcon.Text is limited to 63 characters. A long ticket reference
        /// must be shortened instead of throwing and silently killing capture.
        /// </summary>
        private void SetTrayText(string text)
        {
            if (_tray == null) return;
            try
            {
                string value = string.IsNullOrEmpty(text) ? "SupportIQ Agent" : text;
                if (value.Length > 63) value = value.Substring(0, 60) + "...";
                _tray.Text = value;
            }
            catch
            {
                // A tooltip must never break the agent.
            }
        }

        private void Ui(MethodInvoker action)
        {
            try
            {
                if (IsDisposed || !IsHandleCreated) return;
                if (InvokeRequired) BeginInvoke(action);
                else action();
            }
            catch
            {
                // The window closed between the check and the dispatch.
            }
        }

        private void UiSync(MethodInvoker action)
        {
            if (IsDisposed || !IsHandleCreated) return;
            if (InvokeRequired) Invoke(action);
            else action();
        }

        /* -------------------------------------------------------------- Pairing */

        private void PairClicked(object sender, EventArgs e)
        {
            string server = AppConfig.NormalizeServer(_serverBox.Text);
            string code = AppConfig.NormalizeCode(_codeBox.Text);
            if (server.Length == 0)
            {
                _pairStatus.Text = "Enter the SupportIQ server address.";
                return;
            }
            if (code.Length != 8)
            {
                _pairStatus.Text = "Enter the 8-character pairing code from the portal.";
                return;
            }
            StartPairing(server, code);
        }

        private void StartPairing(string server, string code)
        {
            if (_pairing) return;
            _pairing = true;
            _pairButton.Enabled = false;
            _pairStatus.Text = "Pairing this PC…";
            Thread thread = new Thread(new ThreadStart(delegate { PairWorker(server, code); }));
            thread.IsBackground = true;
            thread.Start();
        }

        private void PairWorker(string server, string code)
        {
            try
            {
                Log.Write("Pairing against " + server);
                AgentApi api = new AgentApi(server, null);
                PairResult result = api.Pair(code, Environment.MachineName);
                Log.Write("Paired as device " + result.DeviceId + " (" + result.DeviceName + ")");
                _config.ServerUrl = server;
                _config.Token = result.Token;
                _config.DeviceId = result.DeviceId;
                _config.DeviceName = result.DeviceName;
                _config.Save();
                Ui(delegate
                {
                    _pairing = false;
                    _pairButton.Enabled = true;
                    _codeBox.Text = "";
                    _pairStatus.Text = "";
                    ShowPaired();
                    StartAgent();
                });
            }
            catch (Exception error)
            {
                Log.Write("Pairing failed: " + error);
                Ui(delegate
                {
                    _pairing = false;
                    _pairButton.Enabled = true;
                    _pairStatus.Text = error.Message;
                });
            }
        }

        private void ConsumePendingPair()
        {
            if (_pairing || _config.IsPaired) return;
            try
            {
                if (!File.Exists(AppConfig.PendingPairPath)) return;
                string text = File.ReadAllText(AppConfig.PendingPairPath);
                File.Delete(AppConfig.PendingPairPath);
                System.Web.Script.Serialization.JavaScriptSerializer json =
                    new System.Web.Script.Serialization.JavaScriptSerializer();
                Dictionary<string, object> pending =
                    json.DeserializeObject(text) as Dictionary<string, object>;
                string server = Json.GetString(pending, "server");
                string code = Json.GetString(pending, "code");
                if (string.IsNullOrEmpty(server) || string.IsNullOrEmpty(code)) return;
                _serverBox.Text = server;
                _codeBox.Text = code;
                StartPairing(server, code);
            }
            catch
            {
                // A malformed handoff file is simply ignored.
            }
        }

        private void UnpairClicked(object sender, EventArgs e)
        {
            DialogResult answer = MessageBox.Show(
                this,
                "Forget this PC? IT support won't be able to connect until it's paired again.",
                "SupportIQ Agent",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;

            AgentApi api = _api;
            StopAgent();
            Interlocked.Exchange(ref _activeSessionId, 0);
            if (_bar != null)
            {
                _bar.Close();
                _bar = null;
            }
            Thread thread = new Thread(new ThreadStart(delegate
            {
                try
                {
                    if (api != null) api.Unpair();
                }
                catch
                {
                    // The token may already be revoked; local state still clears.
                }
                _config.Clear();
                Ui(delegate { ShowPairing("This PC was unpaired. Pair it again whenever you need support."); });
            }));
            thread.IsBackground = true;
            thread.Start();
        }

        private void AutoStartChanged(object sender, EventArgs e)
        {
            _config.AutoStart = _autoStartBox.Checked;
            _config.Save();
            AutoStartRegistry.Apply(_config.AutoStart);
        }

        /* ---------------------------------------------------------- Agent loops */

        private void StartAgent()
        {
            if (_running || !_config.IsPaired) return;
            _api = new AgentApi(_config.ServerUrl, _config.Token);
            _running = true;
            _failures = 0;
            _pollThread = new Thread(PollLoop);
            _pollThread.IsBackground = true;
            _pollThread.Start();
            _updateThread = new Thread(UpdateLoop);
            _updateThread.IsBackground = true;
            _updateThread.Start();
        }

        private void StopAgent()
        {
            _running = false;
        }

        private void PollLoop()
        {
            HashSet<long> prompted = new HashSet<long>();
            while (_running)
            {
                try
                {
                    long active = Interlocked.Read(ref _activeSessionId);
                    PollResult poll = _api.Poll(20, active);
                    _failures = 0;
                    if (!string.IsNullOrEmpty(poll.FallbackServerUrl) &&
                        !string.Equals(poll.FallbackServerUrl, _config.FallbackServerUrl, StringComparison.OrdinalIgnoreCase))
                    {
                        // Remember the machine-name address for a future IP change.
                        _config.FallbackServerUrl = poll.FallbackServerUrl;
                        _config.Save();
                    }

                    if (active != 0)
                    {
                        Dictionary<string, object> current = poll.Session;
                        bool stillActive = current != null && (Json.GetString(current, "status") ?? "") == "active";
                        if (!stillActive)
                        {
                            EndActive();
                        }
                        else
                        {
                            ScreenInjector.Apply(poll.Commands);
                            bool privacy = Json.GetBool(current, "privacyMode");
                            string requester = RequesterName(current);
                            Ui(delegate
                            {
                                SetStatus("Remote session active — sharing this screen", true);
                                SetPrivacy(privacy, requester);
                            });
                        }
                    }
                    else
                    {
                        foreach (Dictionary<string, object> session in poll.Sessions)
                        {
                            if ((Json.GetString(session, "status") ?? "") != "active") continue;
                            StartActive(session);
                            break;
                        }
                    }

                    foreach (Dictionary<string, object> session in poll.Sessions)
                    {
                        if ((Json.GetString(session, "status") ?? "") != "requested") continue;
                        long id = Json.GetLong(session, "id");
                        if (id <= 0 || prompted.Contains(id)) continue;
                        if (Interlocked.Read(ref _activeSessionId) != 0) continue;

                        prompted.Add(id);
                        string requester = RequesterName(session);
                        string ticket = Json.GetString(session, "ticketRef") ?? "";
                        bool allow = AskConsent(id, requester, ticket);
                        try
                        {
                            _api.Answer(id, allow);
                            if (allow) StartActive(session);
                            else Ui(delegate { SetStatus("Request declined. Waiting for support requests.", false); });
                        }
                        catch (AgentApiException error)
                        {
                            if (error.Status == 401)
                            {
                                HandleRevoked();
                                return;
                            }
                            if (error.Status == 409)
                            {
                                // Unattended access may have started this session while
                                // the prompt was open. The next poll picks it up.
                                continue;
                            }
                            string message = error.Message;
                            Ui(delegate { SetStatus("Couldn't join the session: " + message, false); });
                        }
                    }

                    if (Interlocked.Read(ref _activeSessionId) == 0)
                    {
                        Ui(delegate { SetStatus("Connected — waiting for support requests", false); });
                    }
                }
                catch (AgentApiException error)
                {
                    if (!_running) return;
                    Log.Write("Poll failed: " + error.Status + " " + error.Message);
                    if (error.Status == 401)
                    {
                        HandleRevoked();
                        return;
                    }
                    if (error.Status == 0 && TryFallbackServer())
                    {
                        _failures = 0;
                        Ui(delegate { SetStatus("Reconnected to SupportIQ", false); });
                        continue;
                    }
                    _failures++;
                    Ui(delegate { SetStatus("Can't reach SupportIQ. Retrying…", false); });
                    Sleep(Math.Min(10000, 1000 * Math.Max(1, _failures)));
                }
                catch
                {
                    if (!_running) return;
                    _failures++;
                    Sleep(Math.Min(10000, 1000 * Math.Max(1, _failures)));
                }
            }
        }

        private static string RequesterName(Dictionary<string, object> session)
        {
            Dictionary<string, object> by = Json.AsDict(session.ContainsKey("requestedBy") ? session["requestedBy"] : null);
            string name = Json.GetString(by, "name");
            return string.IsNullOrEmpty(name) ? "IT support" : name;
        }

        private bool AskConsent(long sessionId, string requester, string ticketRef)
        {
            bool allowed = false;
            _consentOpen = true;
            Log.Write("Showing consent prompt for " + requester + " (" + ticketRef + ")");
            try
            {
                UiSync(delegate
                {
                    using (ConsentForm form = new ConsentForm(requester, ticketRef, delegate
                    {
                        return SessionStillPending(sessionId);
                    }))
                    {
                        form.TopMost = true;
                        DialogResult result = form.ShowDialog(this);
                        Log.Write("Consent dialog result: " + result);
                        allowed = result == DialogResult.OK;
                    }
                });
            }
            catch (Exception error)
            {
                Log.Write("Consent prompt failed: " + error);
                allowed = false;
            }
            _consentOpen = false;
            Log.Write("Consent answer: " + (allowed ? "allow" : "deny"));
            return allowed;
        }

        /// <summary>
        /// True while the server still has this request waiting for an answer. If
        /// IT connects with the unattended password, the prompt closes itself.
        /// </summary>
        private bool SessionStillPending(long sessionId)
        {
            try
            {
                string status = _api.GetSessionStatus(sessionId);
                return string.IsNullOrEmpty(status) || status == "requested" || status == "ready";
            }
            catch
            {
                // Keep the prompt visible on a transient network error.
                return true;
            }
        }

        private void StartActive(Dictionary<string, object> session)
        {
            long id = Json.GetLong(session, "id");
            if (id <= 0) return;
            if (Interlocked.Exchange(ref _activeSessionId, id) == id) return;

            // A new session gets a fresh chance at privacy mode.
            _privacyUnavailable = false;

            string requester = RequesterName(session);
            string ticket = Json.GetString(session, "ticketRef") ?? "";
            Log.Write("Session " + id + " is active for " + requester);

            // Start sharing first. Tray/UI updates must never be able to stop a
            // session from streaming; a long ticket ref used to throw here and
            // left the technician with input but a black screen.
            SetTrayText(!string.IsNullOrEmpty(ticket) ? "SupportIQ Agent - session for " + ticket : "SupportIQ Agent");
            Thread capture = new Thread(new ThreadStart(delegate { CaptureLoop(id); }));
            capture.IsBackground = true;
            capture.Start();
            _captureThread = capture;

            Ui(delegate
            {
                SetStatus("Remote session active — " + requester + " is connected", true);
                ShowActiveBar(requester);
                SetPrivacy(Json.GetBool(session, "privacyMode"), requester);
            });
        }

        private void EndActive()
        {
            long id = Interlocked.Exchange(ref _activeSessionId, 0);
            if (id == 0) return;
            SetTrayText("SupportIQ Agent");
            Ui(delegate
            {
                if (_privacy != null)
                {
                    _privacy.Close();
                    _privacy = null;
                }
                if (_bar != null)
                {
                    _bar.Close();
                    _bar = null;
                }
                if (_running) SetStatus("Connected — waiting for support requests", false);
            });
        }

        private void ShowActiveBar(string requester)
        {
            if (_bar != null)
            {
                _bar.Close();
                _bar = null;
            }
            _bar = new ActiveBarForm(requester, StopSession);
            _bar.Show();
            _bar.PositionAtTop();
        }

        /// <summary>
        /// Shows or hides the full-screen privacy animation on the customer's
        /// display. The overlay is click-through and excluded from screen
        /// capture, so the technician keeps seeing and controlling the real
        /// desktop underneath it.
        /// </summary>
        private void SetPrivacy(bool enabled, string requester)
        {
            if (!enabled)
            {
                _privacyUnavailable = false;
                if (_privacy != null)
                {
                    _privacy.Close();
                    _privacy = null;
                }
                return;
            }
            if (_privacy != null && !_privacy.IsDisposed) return;
            // Retrying a whole full-screen window on every poll is expensive and
            // would make the agent feel stuck on machines that cannot exclude it
            // from capture. Try once per session instead.
            if (_privacyUnavailable) return;

            PrivacyScreenForm screen = new PrivacyScreenForm(requester);
            bool excluded = false;
            try
            {
                screen.Show();
                excluded = screen.ReapplyCaptureExclusion();
            }
            catch (Exception error)
            {
                Log.Write("Privacy screen failed to open: " + error);
                screen.Dispose();
                _privacyUnavailable = true;
                return;
            }
            if (!excluded)
            {
                // Never cover the screen unless the technician can still see it.
                screen.Close();
                screen.Dispose();
                _privacyUnavailable = true;
                Log.Write("Privacy mode unavailable: screen capture could not exclude the overlay.");
                return;
            }
            _privacy = screen;
            // Keep the red "Stop sharing" bar clickable above the animation.
            if (_bar != null && !_bar.IsDisposed) _bar.BringToFront();
            Log.Write("Privacy screen enabled.");
        }

        private void StopSession()
        {
            long id = Interlocked.Read(ref _activeSessionId);
            if (id == 0) return;
            EndActive();
            AgentApi api = _api;
            Thread thread = new Thread(new ThreadStart(delegate
            {
                try
                {
                    if (api != null) api.Stop(id);
                }
                catch
                {
                    // The server already closed the session.
                }
            }));
            thread.IsBackground = true;
            thread.Start();
        }

        private void CaptureLoop(long id)
        {
            long sequence = 0;
            long quality = 60;
            DateTime lastDiagnostic = DateTime.MinValue;
            while (_running && Interlocked.Read(ref _activeSessionId) == id)
            {
                Stopwatch watch = Stopwatch.StartNew();
                try
                {
                    CapturedFrame frame = ScreenCapture.Capture(MaxFrameWidth);
                    if (frame != null)
                    {
                        using (frame)
                        {
                            byte[] jpeg = frame.ToJpeg(quality);
                            if (jpeg.Length > 2 * 1024 * 1024 && quality > 35)
                            {
                                quality -= 10;
                            }
                            else
                            {
                                _api.PostFrame(id, jpeg, frame.Width, frame.Height, ++sequence);
                                if (sequence == 1)
                                {
                                    Log.Write(
                                        "Sharing screen: " + frame.Width + "x" + frame.Height +
                                        " " + jpeg.Length + " bytes");
                                }
                            }
                        }
                    }
                    else
                    {
                        // A missing frame usually means the desktop denied GDI access.
                        if ((DateTime.UtcNow - lastDiagnostic).TotalSeconds >= 10)
                        {
                            lastDiagnostic = DateTime.UtcNow;
                            Log.Write("Screen capture returned no frame.");
                        }
                    }
                }
                catch (AgentApiException error)
                {
                    if (error.Status == 401)
                    {
                        HandleRevoked();
                        return;
                    }
                    if (error.Status == 404 || error.Status == 409)
                    {
                        EndActive();
                        return;
                    }
                    if ((DateTime.UtcNow - lastDiagnostic).TotalSeconds >= 10)
                    {
                        lastDiagnostic = DateTime.UtcNow;
                        Log.Write("Frame upload failed: " + error.Status + " " + error.Message);
                    }
                }
                catch (Exception error)
                {
                    // Transient capture/network errors keep the session alive, but a
                    // persistent one has to be visible in the agent log.
                    if ((DateTime.UtcNow - lastDiagnostic).TotalSeconds >= 10)
                    {
                        lastDiagnostic = DateTime.UtcNow;
                        Log.Write("Screen capture failed: " + error);
                    }
                }
                int delay = FrameIntervalMs - (int)watch.ElapsedMilliseconds;
                if (delay > 0) Sleep(delay);
            }
        }

        /// <summary>
        /// The host's LAN address can change. When the saved address stops
        /// answering, try the machine-name address learned from the server and
        /// keep using it if it works, so no re-pairing is needed.
        /// </summary>
        private bool TryFallbackServer()
        {
            string fallback = _config.FallbackServerUrl;
            if (string.IsNullOrEmpty(fallback)) return false;
            if (string.Equals(AppConfig.NormalizeServer(fallback), _config.ServerUrl, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            if ((DateTime.UtcNow - _fallbackAttempt).TotalSeconds < 60) return false;
            _fallbackAttempt = DateTime.UtcNow;

            try
            {
                AgentApi candidate = new AgentApi(fallback, _config.Token);
                // A dead address or a revoked token throws; only a live one switches.
                candidate.Poll(0, 0);
                string previous = _config.ServerUrl;
                _config.ServerUrl = candidate.ServerUrl;
                _config.FallbackServerUrl = previous;
                _config.Save();
                _api = candidate;
                Log.Write("Server address changed to " + _config.ServerUrl);
                Ui(delegate
                {
                    if (_serverLabel != null) _serverLabel.Text = "Paired with " + _config.ServerUrl;
                });
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void HandleRevoked()
        {
            if (!_running) return;
            Log.Write("Device token rejected; pairing cleared");
            _running = false;
            Interlocked.Exchange(ref _activeSessionId, 0);
            _config.Token = "";
            _config.Save();
            Ui(delegate
            {
                if (_bar != null)
                {
                    _bar.Close();
                    _bar = null;
                }
                _pairing = false;
                _pairButton.Enabled = true;
                ShowPairing("This PC is no longer paired. Ask SupportIQ for a new pairing code, then pair it again.");
            });
        }

        private static void Sleep(int milliseconds)
        {
            if (milliseconds > 0) Thread.Sleep(milliseconds);
        }

        /* -------------------------------------------------------------- Updates */

        /// <summary>Picks up newly published builds without reinstalling by hand.</summary>
        private void UpdateLoop()
        {
            Sleep(5000);
            while (_running)
            {
                bool busy = _pairing || _consentOpen || Interlocked.Read(ref _activeSessionId) != 0;
                if (busy)
                {
                    Sleep(60000);
                    continue;
                }
                try
                {
                    UpdateInfo info = _api.GetUpdateInfo();
                    if (info.Available && info.Size > 0 && info.Sha256.Length == 64 &&
                        !string.Equals(info.Sha256, LocalHash(), StringComparison.OrdinalIgnoreCase))
                    {
                        Log.Write("Update available: " + Shorten(info.Sha256));
                        if (ApplyUpdate(info)) return;
                    }
                }
                catch (AgentApiException error)
                {
                    if (error.Status != 401) Log.Write("Update check failed: " + error.Status + " " + error.Message);
                }
                catch (Exception error)
                {
                    Log.Write("Update check failed: " + error.Message);
                }
                // Pick up fixes quickly; an idle agent is cheap to update.
                Sleep(3 * 60 * 1000);
            }
        }

        private string LocalHash()
        {
            if (_localHash == null)
            {
                try
                {
                    _localHash = AgentApi.HashFile(Application.ExecutablePath);
                }
                catch
                {
                    _localHash = "";
                }
            }
            return _localHash;
        }

        private static string Shorten(string hash)
        {
            return string.IsNullOrEmpty(hash) || hash.Length < 12 ? hash : hash.Substring(0, 12);
        }

        private bool ApplyUpdate(UpdateInfo info)
        {
            string exePath = Application.ExecutablePath;
            string installDir = Path.GetDirectoryName(exePath);
            string updateDir = Path.Combine(installDir, "update");
            string staged = Path.Combine(updateDir, "SupportIQ-Agent.exe");
            try
            {
                Directory.CreateDirectory(updateDir);
                if (File.Exists(staged)) File.Delete(staged);
                Log.Write("Downloading agent update " + Shorten(info.Sha256));
                _api.DownloadUpdate(staged);
                string hash = AgentApi.HashFile(staged);
                if (!string.Equals(hash, info.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    Log.Write("Agent update hash mismatch; discarded");
                    try { File.Delete(staged); } catch { }
                    return false;
                }

                string script = Path.Combine(installDir, "supportiq-update.cmd");
                File.WriteAllText(script, UpdaterScript());
                Log.Write("Applying agent update and restarting");

                ProcessStartInfo start = new ProcessStartInfo();
                start.FileName = "cmd.exe";
                start.Arguments = "/c \"" + script + "\"";
                start.WindowStyle = ProcessWindowStyle.Hidden;
                start.CreateNoWindow = true;
                start.UseShellExecute = false;
                Process.Start(start);

                Ui(delegate { Quit(); });
                return true;
            }
            catch (Exception error)
            {
                Log.Write("Agent update failed: " + error.Message);
                try { if (File.Exists(staged)) File.Delete(staged); } catch { }
                return false;
            }
        }

        /// <summary>Waits for this process to exit, swaps the exe, and starts it again.</summary>
        private static string UpdaterScript()
        {
            return string.Join("\r\n", new string[]
            {
                "@echo off",
                "setlocal",
                "ping 127.0.0.1 -n 4 >nul",
                "set /a tries=0",
                ":retry",
                "move /y \"%~dp0update\\SupportIQ-Agent.exe\" \"%~dp0SupportIQ-Agent.exe\" >nul 2>&1",
                "if not errorlevel 1 goto started",
                "set /a tries+=1",
                "if %tries% geq 30 goto started",
                "ping 127.0.0.1 -n 2 >nul",
                "goto retry",
                ":started",
                "start \"\" \"%~dp0SupportIQ-Agent.exe\"",
                "del \"%~f0\" >nul 2>&1",
                "exit /b",
                "",
            });
        }

        /* ------------------------------------------------------------- Window */

        private void Restore()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        private void HideToTray()
        {
            Hide();
            if (!_trayHintShown)
            {
                _trayHintShown = true;
                _tray.ShowBalloonTip(
                    4000,
                    "SupportIQ Agent is still running",
                    "It stays in the tray so IT support can reach you when you ask for help.",
                    ToolTipIcon.Info);
            }
        }

        private void Quit()
        {
            _quitting = true;
            StopAgent();
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!_quitting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                HideToTray();
                return;
            }

            StopAgent();
            long id = Interlocked.Exchange(ref _activeSessionId, 0);
            if (_privacy != null)
            {
                _privacy.Close();
                _privacy = null;
            }
            if (_bar != null)
            {
                _bar.Close();
                _bar = null;
            }
            if (id != 0 && _api != null)
            {
                try
                {
                    _api.Stop(id);
                }
                catch
                {
                    // Shutting down; the server expires the session anyway.
                }
            }
            if (_pendingTimer != null) _pendingTimer.Stop();
            if (_tray != null)
            {
                _tray.Visible = false;
                _tray.Dispose();
                _tray = null;
            }
            base.OnFormClosing(e);
        }
    }

    /// <summary>Visible approval prompt. The customer must click Allow.</summary>
    internal sealed class ConsentForm : Form
    {
        private readonly Func<bool> stillPending;
        private readonly System.Windows.Forms.Timer statusTimer;
        private bool closingForStatus;

        public ConsentForm(string requester, string ticketRef, Func<bool> stillPending)
        {
            this.stillPending = stillPending;
            Text = "SupportIQ — remote access request";
            ClientSize = new Size(440, 304);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ControlBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            Font = new Font("Segoe UI", 9F);
            Icon = SystemIcons.Information;

            Label title = new Label();
            title.Text = requester + " wants remote access";
            title.Location = new Point(22, 22);
            title.Size = new Size(396, 30);
            title.Font = new Font("Segoe UI Semibold", 14F);
            title.ForeColor = Color.FromArgb(15, 23, 42);
            Controls.Add(title);

            Label ticket = new Label();
            ticket.Text = string.IsNullOrEmpty(ticketRef)
                ? "Support request from the SupportIQ portal"
                : "Support request " + ticketRef;
            ticket.Location = new Point(24, 58);
            ticket.Size = new Size(392, 20);
            ticket.ForeColor = Color.FromArgb(100, 116, 139);
            Controls.Add(ticket);

            Label body = new Label();
            body.Text =
                "If you allow this, they will be able to:\n" +
                "   •  See everything on this screen\n" +
                "   •  Use your mouse and keyboard\n\n" +
                "A red bar stays at the top of your screen. Click Stop sharing there,\n" +
                "or stop the session in the portal, to disconnect immediately.";
            body.Location = new Point(24, 92);
            body.Size = new Size(394, 112);
            body.ForeColor = Color.FromArgb(51, 65, 85);
            Controls.Add(body);

            Label warning = new Label();
            warning.Text = "Only allow this if you asked SupportIQ for help and you recognize this person.";
            warning.Location = new Point(24, 210);
            warning.Size = new Size(394, 36);
            warning.ForeColor = Color.FromArgb(146, 64, 14);
            Controls.Add(warning);

            Button allow = new Button();
            allow.Text = "Allow";
            allow.Location = new Point(286, 254);
            allow.Size = new Size(132, 36);
            allow.DialogResult = DialogResult.OK;
            allow.FlatStyle = FlatStyle.System;
            allow.Click += delegate { Log.Write("Allow button clicked"); };
            Controls.Add(allow);

            Button deny = new Button();
            deny.Text = "Don't allow";
            deny.Location = new Point(148, 254);
            deny.Size = new Size(128, 36);
            deny.DialogResult = DialogResult.Cancel;
            deny.FlatStyle = FlatStyle.System;
            deny.Click += delegate { Log.Write("Deny button clicked"); };
            Controls.Add(deny);

            AcceptButton = allow;
            CancelButton = deny;

            if (stillPending != null)
            {
                statusTimer = new System.Windows.Forms.Timer();
                statusTimer.Interval = 2500;
                statusTimer.Tick += OnStatusTick;
                statusTimer.Start();
            }
        }

        private void OnStatusTick(object sender, EventArgs e)
        {
            if (closingForStatus || stillPending == null) return;
            bool pending;
            try
            {
                pending = stillPending();
            }
            catch
            {
                pending = true;
            }
            if (pending) return;

            closingForStatus = true;
            statusTimer.Stop();
            Log.Write("Consent prompt closed because the remote session changed state");
            DialogResult = DialogResult.Abort;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && statusTimer != null)
            {
                statusTimer.Stop();
                statusTimer.Dispose();
            }
            base.Dispose(disposing);
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Log.Write("Consent dialog shown");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            Log.Write("Consent dialog closing: " + e.CloseReason);
            base.OnFormClosing(e);
        }
    }

    /// <summary>Always-on-top red bar so sharing is impossible to miss.</summary>
    internal sealed class ActiveBarForm : Form
    {
        private readonly Action _onStop;

        public ActiveBarForm(string requester, Action onStop)
        {
            _onStop = onStop;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            Size = new Size(640, 58);
            BackColor = Color.FromArgb(153, 27, 27);
            Font = new Font("Segoe UI", 9F);

            Label label = new Label();
            label.Text = "SupportIQ  ·  " + requester + " is controlling this screen";
            label.ForeColor = Color.White;
            label.Font = new Font("Segoe UI Semibold", 10F);
            label.AutoSize = true;
            label.Location = new Point(18, 19);
            Controls.Add(label);

            Button stop = new Button();
            stop.Text = "Stop sharing";
            stop.Location = new Point(Size.Width - 142, 12);
            stop.Size = new Size(124, 34);
            stop.FlatStyle = FlatStyle.Flat;
            stop.FlatAppearance.BorderSize = 0;
            stop.BackColor = Color.White;
            stop.ForeColor = Color.FromArgb(153, 27, 27);
            stop.Click += delegate
            {
                Close();
                _onStop();
            };
            Controls.Add(stop);
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
                cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE
                return cp;
            }
        }

        public void PositionAtTop()
        {
            Rectangle screen = Screen.PrimaryScreen.Bounds;
            Location = new Point(Math.Max(0, (screen.Width - Width) / 2), 12);
        }
    }
}

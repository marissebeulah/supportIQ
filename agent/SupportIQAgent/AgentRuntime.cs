using System;
using System.Collections.Generic;
using System.Threading;

namespace SupportIQ.Agent
{
    /// <summary>
    /// Owns the agent's network loop. It long-polls SupportIQ for session invites
    /// and input, streams JPEG frames while a session is active, and never
    /// captures or injects anything without an explicit Allow.
    /// </summary>
    public class AgentRuntime : IDisposable
    {
        private readonly AgentConfig config;
        private readonly AgentContext context;
        private readonly HttpApi api;

        private Thread pollThread;
        private Thread captureThread;
        private volatile bool running;
        private volatile bool capturing;
        private volatile string activeSessionId;
        private volatile string promptSessionId;
        private int sequence;

        public AgentRuntime(AgentConfig config, AgentContext context)
        {
            this.config = config;
            this.context = context;
            this.api = new HttpApi(config.ServerUrl, config.GetToken());
        }

        public string ActiveSessionId
        {
            get { return activeSessionId; }
        }

        public void Start()
        {
            if (running) return;
            running = true;
            pollThread = new Thread(PollLoop);
            pollThread.IsBackground = true;
            pollThread.Name = "SupportIQ poll";
            pollThread.Start();
        }

        public void Dispose()
        {
            running = false;
            capturing = false;
            try
            {
                if (pollThread != null) pollThread.Join(1200);
            }
            catch
            {
                // Ignore shutdown races.
            }
            InputInjector.ReleaseAll();
        }

        /* ------------------------------------------------------------- Polling */

        private void PollLoop()
        {
            while (running)
            {
                try
                {
                    string path = "/api/agent/poll?wait=20";
                    string sessionId = activeSessionId;
                    if (!string.IsNullOrEmpty(sessionId))
                    {
                        path += "&sessionId=" + Uri.EscapeDataString(sessionId);
                    }
                    PollResponse poll = api.GetJson<PollResponse>(path, 35000);
                    if (!running) return;
                    HandlePoll(poll);
                }
                catch (ApiException error)
                {
                    if (error.Status == 401)
                    {
                        running = false;
                        context.OnPairingLost();
                        return;
                    }
                    Thread.Sleep(2000);
                }
                catch
                {
                    if (running) Thread.Sleep(2000);
                }
            }
        }

        private void HandlePoll(PollResponse poll)
        {
            if (poll == null) return;

            string sessionId = activeSessionId;
            if (!string.IsNullOrEmpty(sessionId))
            {
                if (poll.session != null && poll.session.status != "active")
                {
                    StopCapture();
                    activeSessionId = null;
                    context.OnSessionEnded(sessionId);
                }
                else if (poll.commands != null && poll.commands.Count > 0)
                {
                    InputInjector.Handle(poll.commands);
                }
            }

            if (!string.IsNullOrEmpty(activeSessionId) || !string.IsNullOrEmpty(promptSessionId))
            {
                return;
            }
            if (poll.sessions == null) return;

            foreach (RemoteSessionDto session in poll.sessions)
            {
                if (session == null) continue;
                if (session.status == "requested")
                {
                    promptSessionId = session.id.ToString();
                    context.OnSessionInvite(session);
                    return;
                }
                if (session.status == "active" && session.agent != null && session.agent.id == config.DeviceId)
                {
                    // Resume an approved session after the agent was restarted.
                    activeSessionId = session.id.ToString();
                    StartCapture();
                    context.OnSessionActive(session);
                    return;
                }
            }
        }

        /* ------------------------------------------------------------- Answering */

        public void SendAnswer(long sessionId, bool allow)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    Dictionary<string, object> body = new Dictionary<string, object>();
                    body["allow"] = allow;
                    AnswerResponse response = api.PostJson<AnswerResponse>(
                        "/api/agent/sessions/" + sessionId + "/answer",
                        body,
                        20000);
                    promptSessionId = null;
                    if (allow && response != null && response.remoteSession != null)
                    {
                        activeSessionId = response.remoteSession.id.ToString();
                        StartCapture();
                        context.OnSessionActive(response.remoteSession);
                    }
                    else
                    {
                        context.OnSessionDeclined();
                    }
                }
                catch (ApiException error)
                {
                    promptSessionId = null;
                    if (error.Status == 401)
                    {
                        running = false;
                        context.OnPairingLost();
                    }
                    else
                    {
                        context.OnAnswerFailed(error.Message);
                    }
                }
                catch (Exception error)
                {
                    promptSessionId = null;
                    context.OnAnswerFailed(error.Message);
                }
            });
        }

        /* ------------------------------------------------------------ Capture */

        private void StartCapture()
        {
            if (capturing) return;
            capturing = true;
            captureThread = new Thread(CaptureLoop);
            captureThread.IsBackground = true;
            captureThread.Name = "SupportIQ capture";
            captureThread.Start();
        }

        private void StopCapture()
        {
            capturing = false;
            try
            {
                if (captureThread != null && captureThread.IsAlive)
                {
                    captureThread.Join(1500);
                }
            }
            catch
            {
                // Ignore shutdown races.
            }
            InputInjector.ReleaseAll();
        }

        private void CaptureLoop()
        {
            while (running && capturing)
            {
                string sessionId = activeSessionId;
                if (string.IsNullOrEmpty(sessionId)) break;

                try
                {
                    CapturedFrame frame = ScreenCapture.Capture(1440, 50);
                    Dictionary<string, string> headers = new Dictionary<string, string>();
                    headers["X-Frame-Width"] = frame.Width.ToString();
                    headers["X-Frame-Height"] = frame.Height.ToString();
                    headers["X-Frame-Sequence"] = Interlocked.Increment(ref sequence).ToString();
                    api.PostBytes(
                        "/api/agent/sessions/" + sessionId + "/frame",
                        frame.Jpeg,
                        headers,
                        15000);
                }
                catch (ApiException error)
                {
                    if (error.Status == 401)
                    {
                        running = false;
                        context.OnPairingLost();
                        break;
                    }
                    if (error.Status == 403 || error.Status == 404 || error.Status == 409)
                    {
                        capturing = false;
                        activeSessionId = null;
                        context.OnSessionEnded(sessionId);
                        break;
                    }
                    Thread.Sleep(600);
                }
                catch
                {
                    // A locked screen or display change can fail; retry quietly.
                    Thread.Sleep(700);
                }

                if (!capturing) break;
                Thread.Sleep(140);
            }
        }

        /* ------------------------------------------------------------- Stopping */

        public void StopActiveSession()
        {
            string sessionId = activeSessionId;
            StopCapture();
            activeSessionId = null;
            promptSessionId = null;

            if (!string.IsNullOrEmpty(sessionId))
            {
                string captured = sessionId;
                ThreadPool.QueueUserWorkItem(delegate
                {
                    try
                    {
                        api.PostJson(
                            "/api/agent/sessions/" + captured + "/stop",
                            new Dictionary<string, object>(),
                            15000);
                    }
                    catch
                    {
                        // The server may already have ended it.
                    }
                });
            }
            context.OnSessionEnded(sessionId);
        }
    }
}

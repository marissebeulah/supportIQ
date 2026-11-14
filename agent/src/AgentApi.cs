using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace SupportIQ
{
    internal sealed class AgentApiException : Exception
    {
        public readonly int Status;

        public AgentApiException(int status, string message) : base(message)
        {
            Status = status;
        }
    }

    internal sealed class PairResult
    {
        public string Token;
        public long DeviceId;
        public string DeviceName;
    }

    internal sealed class UpdateInfo
    {
        public bool Available;
        public string Version = "";
        public string Sha256 = "";
        public long Size;
    }

    internal sealed class InputCommand
    {
        public string Type = "";
        public double X;
        public double Y;
        public int Button;
        public int Direction;
        public string Code;
        public string Key;
    }

    internal sealed class PollResult
    {
        public List<Dictionary<string, object>> Sessions = new List<Dictionary<string, object>>();
        public Dictionary<string, object> Session;
        public List<InputCommand> Commands = new List<InputCommand>();
        public string FallbackServerUrl = "";
    }

    /// <summary>Small JSON helpers shared by the agent windows and the API client.</summary>
    internal static class Json
    {
        public static Dictionary<string, object> AsDict(object value)
        {
            return value as Dictionary<string, object>;
        }

        public static object[] AsArray(object value)
        {
            object[] items = value as object[];
            return items ?? new object[0];
        }

        public static string GetString(Dictionary<string, object> root, string key)
        {
            object value;
            if (root == null || !root.TryGetValue(key, out value) || value == null) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        public static long GetLong(Dictionary<string, object> root, string key)
        {
            object value;
            if (root == null || !root.TryGetValue(key, out value) || value == null) return 0;
            try
            {
                return Convert.ToInt64(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                return 0;
            }
        }

        public static bool GetBool(Dictionary<string, object> root, string key)
        {
            object value;
            if (root == null || !root.TryGetValue(key, out value) || value == null) return false;
            if (value is bool) return (bool)value;
            string text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
            return string.Equals(text, "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(text, "1", StringComparison.OrdinalIgnoreCase);
        }

        public static double GetDouble(Dictionary<string, object> root, string key)
        {
            object value;
            if (root == null || !root.TryGetValue(key, out value) || value == null) return 0;
            try
            {
                return Convert.ToDouble(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                return 0;
            }
        }
    }

    /// <summary>HTTP client for the SupportIQ API. All calls are synchronous.</summary>
    internal sealed class AgentApi
    {
        public const string Version = "1.0.7";
        private static bool _tlsConfigured;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private readonly string _server;
        private readonly string _token;

        public AgentApi(string server, string token)
        {
            _server = AppConfig.NormalizeServer(server);
            _token = token ?? "";
            _json.MaxJsonLength = 4 * 1024 * 1024;
            ConfigureTls();
        }

        public string ServerUrl
        {
            get { return _server; }
        }

        private static void ConfigureTls()
        {
            if (_tlsConfigured) return;
            _tlsConfigured = true;
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            ServicePointManager.ServerCertificateValidationCallback =
                delegate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors errors)
                {
                    if (errors == SslPolicyErrors.None) return true;
                    // Local development installs use a self-signed certificate.
                    HttpWebRequest request = sender as HttpWebRequest;
                    return request != null && IsLocalHost(request.Address.Host);
                };
        }

        private static bool IsLocalHost(string host)
        {
            if (string.IsNullOrEmpty(host)) return false;
            if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)) return true;
            IPAddress address;
            if (!IPAddress.TryParse(host, out address)) return false;
            if (IPAddress.IsLoopback(address)) return true;
            byte[] bytes = address.GetAddressBytes();
            if (bytes.Length != 4) return false;
            if (bytes[0] == 10) return true;
            if (bytes[0] == 192 && bytes[1] == 168) return true;
            return bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31;
        }

        private HttpWebRequest CreateRequest(string method, string path, int timeoutMs)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(_server + path);
            request.Method = method;
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            request.KeepAlive = false;
            request.AllowAutoRedirect = false;
            request.UserAgent = "SupportIQ-Agent/" + Version;
            request.Headers["X-Agent-Version"] = Version;
            request.Accept = "application/json";
            if (_token.Length > 0) request.Headers["Authorization"] = "Bearer " + _token;
            return request;
        }

        private static string Send(HttpWebRequest request, byte[] body, string contentType)
        {
            if (body != null)
            {
                request.ContentType = contentType ?? "application/octet-stream";
                request.ContentLength = body.Length;
                using (Stream stream = request.GetRequestStream())
                {
                    stream.Write(body, 0, body.Length);
                }
            }
            try
            {
                using (WebResponse response = request.GetResponse())
                using (Stream stream = response.GetResponseStream())
                using (StreamReader reader = new StreamReader(stream ?? Stream.Null, Encoding.UTF8))
                {
                    return reader.ReadToEnd();
                }
            }
            catch (WebException error)
            {
                HttpWebResponse response = error.Response as HttpWebResponse;
                if (response == null)
                {
                    throw new AgentApiException(0, "Can't reach " + request.Address.Host + ". Check the server address and your connection.");
                }
                string message = "";
                try
                {
                    using (Stream stream = response.GetResponseStream())
                    using (StreamReader reader = new StreamReader(stream ?? Stream.Null, Encoding.UTF8))
                    {
                        string text = reader.ReadToEnd();
                        Dictionary<string, object> payload =
                            new JavaScriptSerializer().DeserializeObject(text) as Dictionary<string, object>;
                        message = Json.GetString(payload, "error") ?? "";
                    }
                }
                catch
                {
                    message = "";
                }
                if (message.Length == 0) message = "The server returned " + (int)response.StatusCode + ".";
                throw new AgentApiException((int)response.StatusCode, message);
            }
        }

        public PairResult Pair(string code, string deviceName)
        {
            Dictionary<string, object> payload = new Dictionary<string, object>();
            payload["code"] = code;
            payload["deviceName"] = deviceName;
            payload["platform"] = "windows";
            payload["agentVersion"] = Version;
            HttpWebRequest request = CreateRequest("POST", "/api/agent/pair", 20000);
            string text = Send(request, Encoding.UTF8.GetBytes(_json.Serialize(payload)), "application/json");

            Dictionary<string, object> root = Json.AsDict(_json.DeserializeObject(text));
            PairResult result = new PairResult();
            result.Token = Json.GetString(root, "token") ?? "";
            Dictionary<string, object> device = Json.AsDict(Get(root, "device"));
            result.DeviceId = Json.GetLong(device, "id");
            result.DeviceName = Json.GetString(device, "name") ?? deviceName;
            if (result.Token.Length == 0) throw new AgentApiException(0, "The server didn't return a device token.");
            return result;
        }

        public PollResult Poll(int waitSeconds, long sessionId)
        {
            string path = "/api/agent/poll?wait=" + waitSeconds.ToString(CultureInfo.InvariantCulture);
            if (sessionId > 0) path += "&sessionId=" + sessionId.ToString(CultureInfo.InvariantCulture);
            HttpWebRequest request = CreateRequest("GET", path, 35000);
            string text = Send(request, null, null);

            PollResult result = new PollResult();
            Dictionary<string, object> root = Json.AsDict(_json.DeserializeObject(text));
            if (root == null) return result;

            foreach (object item in Json.AsArray(Get(root, "sessions")))
            {
                Dictionary<string, object> session = Json.AsDict(item);
                if (session != null) result.Sessions.Add(session);
            }
            result.Session = Json.AsDict(Get(root, "session"));
            result.FallbackServerUrl = Json.GetString(root, "fallbackServerUrl") ?? "";
            foreach (object item in Json.AsArray(Get(root, "commands")))
            {
                Dictionary<string, object> entry = Json.AsDict(item);
                if (entry == null) continue;
                InputCommand command = new InputCommand();
                command.Type = Json.GetString(entry, "t") ?? "";
                command.X = Json.GetDouble(entry, "x");
                command.Y = Json.GetDouble(entry, "y");
                command.Button = (int)Json.GetLong(entry, "b");
                command.Direction = (int)Json.GetLong(entry, "d");
                command.Code = Json.GetString(entry, "c");
                command.Key = Json.GetString(entry, "k");
                if (command.Type.Length > 0) result.Commands.Add(command);
            }
            return result;
        }

        public void Answer(long sessionId, bool allow)
        {
            HttpWebRequest request = CreateRequest(
                "POST",
                "/api/agent/sessions/" + sessionId.ToString(CultureInfo.InvariantCulture) + "/answer",
                20000);
            Send(request, Encoding.UTF8.GetBytes(allow ? "{\"allow\":true}" : "{\"allow\":false}"), "application/json");
        }

        /// <summary>Current server-side status of one session (used to auto-close stale consent prompts).</summary>
        public string GetSessionStatus(long sessionId)
        {
            HttpWebRequest request = CreateRequest(
                "GET",
                "/api/agent/sessions/" + sessionId.ToString(CultureInfo.InvariantCulture),
                8000);
            string text = Send(request, null, null);
            Dictionary<string, object> root = Json.AsDict(_json.DeserializeObject(text));
            Dictionary<string, object> session = Json.AsDict(Get(root, "session"));
            return Json.GetString(session, "status") ?? "";
        }

        public void PostFrame(long sessionId, byte[] jpeg, int width, int height, long sequence)
        {
            HttpWebRequest request = CreateRequest(
                "POST",
                "/api/agent/sessions/" + sessionId.ToString(CultureInfo.InvariantCulture) + "/frame",
                40000);
            request.Headers["X-Frame-Width"] = width.ToString(CultureInfo.InvariantCulture);
            request.Headers["X-Frame-Height"] = height.ToString(CultureInfo.InvariantCulture);
            request.Headers["X-Frame-Sequence"] = sequence.ToString(CultureInfo.InvariantCulture);
            Send(request, jpeg, "image/jpeg");
        }

        public void Stop(long sessionId)
        {
            HttpWebRequest request = CreateRequest(
                "POST",
                "/api/agent/sessions/" + sessionId.ToString(CultureInfo.InvariantCulture) + "/stop",
                15000);
            Send(request, new byte[0], "application/json");
        }

        /// <summary>Revokes this device server-side with its own token.</summary>
        public void Unpair()
        {
            HttpWebRequest request = CreateRequest("DELETE", "/api/agent/device", 10000);
            Send(request, null, null);
        }

        public UpdateInfo GetUpdateInfo()
        {
            string text = Send(CreateRequest("GET", "/api/agent/update", 15000), null, null);
            Dictionary<string, object> root = Json.AsDict(_json.DeserializeObject(text));
            UpdateInfo info = new UpdateInfo();
            info.Available = string.Equals(Json.GetString(root, "available"), "true", StringComparison.OrdinalIgnoreCase);
            info.Version = Json.GetString(root, "version") ?? "";
            info.Sha256 = Json.GetString(root, "sha256") ?? "";
            info.Size = Json.GetLong(root, "size");
            return info;
        }

        public void DownloadUpdate(string destination)
        {
            HttpWebRequest request = CreateRequest("GET", "/api/agent/update/file", 60000);
            try
            {
                using (WebResponse response = request.GetResponse())
                using (Stream input = response.GetResponseStream())
                using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    if (input != null) input.CopyTo(output);
                }
            }
            catch (WebException error)
            {
                HttpWebResponse response = error.Response as HttpWebResponse;
                int status = response == null ? 0 : (int)response.StatusCode;
                throw new AgentApiException(status, "Could not download the agent update.");
            }
        }

        public static string HashFile(string path)
        {
            using (FileStream stream = File.OpenRead(path))
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(stream);
                StringBuilder text = new StringBuilder(hash.Length * 2);
                foreach (byte value in hash) text.Append(value.ToString("x2"));
                return text.ToString();
            }
        }

        private static object Get(Dictionary<string, object> root, string key)
        {
            object value;
            if (root != null && root.TryGetValue(key, out value)) return value;
            return null;
        }
    }
}

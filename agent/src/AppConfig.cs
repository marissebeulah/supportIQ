using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

namespace SupportIQ
{
    /// <summary>Local pairing settings. The device token is a bearer secret.</summary>
    internal sealed class AppConfig
    {
        public string ServerUrl = "";
        /// <summary>Stable machine-name address used when the host's IP changes.</summary>
        public string FallbackServerUrl = "";
        public string Token = "";
        public long DeviceId;
        public string DeviceName = "";
        public bool AutoStart;

        private static string Folder
        {
            get
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                return Path.Combine(appData, "SupportIQ");
            }
        }

        private static string ConfigPath
        {
            get { return Path.Combine(Folder, "agent.json"); }
        }

        public static string PendingPairPath
        {
            get { return Path.Combine(Folder, "pending-pair.json"); }
        }

        public bool IsPaired
        {
            get { return Token.Length > 0 && ServerUrl.Length > 0; }
        }

        public static AppConfig Load()
        {
            AppConfig config = new AppConfig();
            try
            {
                if (File.Exists(ConfigPath))
                {
                    JavaScriptSerializer json = new JavaScriptSerializer();
                    Dictionary<string, object> root =
                        json.DeserializeObject(File.ReadAllText(ConfigPath)) as Dictionary<string, object>;
                    if (root != null)
                    {
                        config.ServerUrl = Json.GetString(root, "serverUrl") ?? "";
                        config.FallbackServerUrl = Json.GetString(root, "fallbackServerUrl") ?? "";
                        config.Token = Json.GetString(root, "token") ?? "";
                        config.DeviceId = Json.GetLong(root, "deviceId");
                        config.DeviceName = Json.GetString(root, "deviceName") ?? "";
                        config.AutoStart = string.Equals(Json.GetString(root, "autoStart"), "true", StringComparison.OrdinalIgnoreCase);
                    }
                }
            }
            catch
            {
                // A damaged settings file should never stop the agent from starting.
            }
            return config;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Folder);
                Dictionary<string, object> root = new Dictionary<string, object>();
                root["serverUrl"] = ServerUrl;
                root["fallbackServerUrl"] = FallbackServerUrl;
                root["token"] = Token;
                root["deviceId"] = DeviceId;
                root["deviceName"] = DeviceName;
                root["autoStart"] = AutoStart ? "true" : "false";
                JavaScriptSerializer json = new JavaScriptSerializer();
                File.WriteAllText(ConfigPath, json.Serialize(root));
            }
            catch
            {
                // Pairing still works for this run even if the file can't be written.
            }
        }

        public void Clear()
        {
            ServerUrl = "";
            FallbackServerUrl = "";
            Token = "";
            DeviceId = 0;
            DeviceName = "";
            Save();
        }

        public static string NormalizeServer(string value)
        {
            string server = (value ?? "").Trim();
            if (server.Length == 0) return "";
            if (server.IndexOf("://", StringComparison.Ordinal) < 0) server = "http://" + server;
            while (server.EndsWith("/", StringComparison.Ordinal)) server = server.Substring(0, server.Length - 1);
            return server;
        }

        public static string NormalizeCode(string value)
        {
            string raw = (value ?? "").ToUpperInvariant();
            System.Text.StringBuilder code = new System.Text.StringBuilder();
            foreach (char c in raw)
            {
                if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) code.Append(c);
            }
            return code.ToString();
        }
    }
}

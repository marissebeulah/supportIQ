using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Security.Cryptography;

namespace SupportIQ.Agent
{
    public class AgentConfig
    {
        public string ServerUrl { get; set; }
        public string DeviceName { get; set; }
        public string UserName { get; set; }
        public long DeviceId { get; set; }
        public string TokenProtected { get; set; }
        public string Token { get; set; }

        public AgentConfig()
        {
            ServerUrl = "http://localhost:3001";
            DeviceName = Environment.MachineName;
        }

        public static string FolderPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "SupportIQ");
            }
        }

        public static string FilePath
        {
            get { return Path.Combine(FolderPath, "agent.json"); }
        }

        public bool HasToken
        {
            get { return !string.IsNullOrEmpty(GetToken()); }
        }

        public string GetToken()
        {
            if (!string.IsNullOrEmpty(TokenProtected))
            {
                try
                {
                    byte[] protectedBytes = Convert.FromBase64String(TokenProtected);
                    byte[] plain = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                    return Encoding.UTF8.GetString(plain);
                }
                catch
                {
                    return null;
                }
            }
            return Token;
        }

        public void SetToken(string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                Token = null;
                TokenProtected = null;
                return;
            }
            try
            {
                byte[] plain = Encoding.UTF8.GetBytes(token);
                byte[] protectedBytes = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
                TokenProtected = Convert.ToBase64String(protectedBytes);
                Token = null;
            }
            catch
            {
                // DPAPI is normally available. Fall back to a user-profile file.
                TokenProtected = null;
                Token = token;
            }
        }

        public static AgentConfig Load()
        {
            try
            {
                if (!File.Exists(FilePath)) return new AgentConfig();
                string json = File.ReadAllText(FilePath, Encoding.UTF8);
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                AgentConfig config = serializer.Deserialize<AgentConfig>(json);
                if (config == null) return new AgentConfig();
                if (string.IsNullOrEmpty(config.ServerUrl)) config.ServerUrl = "http://localhost:3001";
                if (string.IsNullOrEmpty(config.DeviceName)) config.DeviceName = Environment.MachineName;
                return config;
            }
            catch
            {
                return new AgentConfig();
            }
        }

        public void Save()
        {
            Directory.CreateDirectory(FolderPath);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            string json = serializer.Serialize(this);
            File.WriteAllText(FilePath, json, new UTF8Encoding(false));
        }
    }
}

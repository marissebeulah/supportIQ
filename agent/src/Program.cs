using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SupportIQ
{
    internal static class NativeMethods
    {
        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();
    }

    internal static class Program
    {
        private const string UriScheme = "supportiq-agent";
        private const string MutexName = "SupportIQAgent.SingleInstance";

        [STAThread]
        private static void Main(string[] args)
        {
            string pendingServer;
            string pendingCode;
            bool hasPair = ParsePairArgs(args, out pendingServer, out pendingCode);

            bool created;
            using (Mutex mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    // A second launch (for example the portal's "open the agent" link)
                    // hands the pairing details to the instance already in the tray.
                    if (hasPair) WritePendingPair(pendingServer, pendingCode);
                    return;
                }

                try
                {
                    Log.Write("Starting SupportIQ Agent " + AgentApi.Version + (hasPair ? " with pairing details" : ""));
                    Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs error)
                    {
                        Log.Write("UI error: " + error.Exception);
                    };
                    AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs error)
                    {
                        Log.Write("Fatal error: " + error.ExceptionObject);
                    };
                    NativeMethods.SetProcessDPIAware();
                    // Privacy mode blanks the system pointer while it is up. A crash
                    // during a session would leave the customer without a mouse
                    // pointer, so every start puts the normal cursors back.
                    PrivacyScreenForm.RestoreSystemPointer();
                    AppDomain.CurrentDomain.ProcessExit += delegate { PrivacyScreenForm.RestoreSystemPointer(); };
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    RegisterUriScheme();
                    CleanUpUpdateArtifacts();
                    AppConfig config = AppConfig.Load();
                    AutoStartRegistry.Apply(config.AutoStart);
                    Application.Run(new AgentForm(config, hasPair ? pendingServer : null, hasPair ? pendingCode : null));
                    Log.Write("Agent window closed");
                }
                catch (Exception error)
                {
                    Log.Write("Could not start: " + error);
                    throw;
                }
                finally
                {
                    try
                    {
                        mutex.ReleaseMutex();
                    }
                    catch
                    {
                        // The process is already shutting down.
                    }
                }
            }
        }

        private static bool ParsePairArgs(string[] args, out string server, out string code)
        {
            server = null;
            code = null;
            if (args != null)
            {
                foreach (string raw in args)
                {
                    if (string.IsNullOrEmpty(raw)) continue;
                    string arg = raw.Trim().Trim('"');
                    if (arg.StartsWith(UriScheme + ":", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            Uri uri = new Uri(arg);
                            server = QueryValue(uri.Query, "server");
                            code = QueryValue(uri.Query, "code");
                        }
                        catch
                        {
                            // Ignore a malformed protocol link.
                        }
                    }
                    else if (arg.StartsWith("--server=", StringComparison.OrdinalIgnoreCase))
                    {
                        server = arg.Substring("--server=".Length);
                    }
                    else if (arg.StartsWith("--code=", StringComparison.OrdinalIgnoreCase))
                    {
                        code = arg.Substring("--code=".Length);
                    }
                }
            }
            if (!string.IsNullOrEmpty(server)) server = Uri.UnescapeDataString(server);
            if (!string.IsNullOrEmpty(code)) code = AppConfig.NormalizeCode(Uri.UnescapeDataString(code));
            return !string.IsNullOrEmpty(server) && !string.IsNullOrEmpty(code);
        }

        private static string QueryValue(string query, string key)
        {
            if (string.IsNullOrEmpty(query)) return null;
            string trimmed = query.TrimStart('?');
            foreach (string pair in trimmed.Split('&'))
            {
                int index = pair.IndexOf('=');
                if (index <= 0) continue;
                if (string.Equals(pair.Substring(0, index), key, StringComparison.OrdinalIgnoreCase))
                {
                    return pair.Substring(index + 1);
                }
            }
            return null;
        }

        /// <summary>Removes leftovers from a self-update after the new build starts.</summary>
        private static void CleanUpUpdateArtifacts()
        {
            try
            {
                string dir = Path.GetDirectoryName(Application.ExecutablePath);
                string script = Path.Combine(dir, "supportiq-update.cmd");
                if (File.Exists(script)) File.Delete(script);
                string updateDir = Path.Combine(dir, "update");
                if (Directory.Exists(updateDir)) Directory.Delete(updateDir, true);
            }
            catch
            {
                // The updater may still hold the file for a moment.
            }
        }

        private static void WritePendingPair(string server, string code)
        {
            try
            {
                string path = AppConfig.PendingPairPath;
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                Dictionary<string, object> payload = new Dictionary<string, object>();
                payload["server"] = server;
                payload["code"] = code;
                File.WriteAllText(path, new JavaScriptSerializer().Serialize(payload));
            }
            catch
            {
                // The agent already running can still be paired by hand.
            }
        }

        /// <summary>Lets the portal's supportiq-agent:// pair link launch this app.</summary>
        private static void RegisterUriScheme()
        {
            try
            {
                string command = "\"" + Application.ExecutablePath + "\" \"%1\"";
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey("Software\\Classes\\" + UriScheme))
                {
                    if (key == null) return;
                    key.SetValue("", "URL:SupportIQ Agent Protocol");
                    key.SetValue("URL Protocol", "");
                    using (RegistryKey shell = key.CreateSubKey("shell\\open\\command"))
                    {
                        if (shell != null && !string.Equals(command, shell.GetValue("") as string, StringComparison.Ordinal))
                        {
                            shell.SetValue("", command);
                        }
                    }
                }
            }
            catch
            {
                // Protocol registration needs no admin rights but can be blocked by policy.
            }
        }
    }

    internal static class AutoStartRegistry
    {
        private const string RunKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        private const string ValueName = "SupportIQAgent";

        public static void Apply(bool enabled)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (key == null) return;
                    if (enabled)
                    {
                        string command = "\"" + Application.ExecutablePath + "\"";
                        if (!string.Equals(command, key.GetValue(ValueName) as string, StringComparison.Ordinal))
                        {
                            key.SetValue(ValueName, command);
                        }
                    }
                    else if (key.GetValue(ValueName) != null)
                    {
                        key.DeleteValue(ValueName, false);
                    }
                }
            }
            catch
            {
                // Auto-start is optional; a locked registry just leaves the agent manual.
            }
        }
    }
}

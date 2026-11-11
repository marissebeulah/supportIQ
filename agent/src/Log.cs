using System;
using System.IO;

namespace SupportIQ
{
    /// <summary>Append-only local log used for diagnosing startup and pairing issues.</summary>
    internal static class Log
    {
        private static readonly object Gate = new object();

        public static string LogPath
        {
            get
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                return Path.Combine(appData, "SupportIQ", "agent.log");
            }
        }

        public static void Write(string message)
        {
            try
            {
                lock (Gate)
                {
                    string path = LogPath;
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    FileInfo info = new FileInfo(path);
                    if (info.Exists && info.Length > 512 * 1024)
                    {
                        File.Delete(path);
                    }
                    File.AppendAllText(
                        path,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine);
                }
            }
            catch
            {
                // Diagnostics must never break the agent.
            }
        }
    }
}

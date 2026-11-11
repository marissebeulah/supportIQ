using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace SupportIQ.Agent
{
    public class ApiException : Exception
    {
        public int Status { get; private set; }

        public ApiException(int status, string message) : base(message)
        {
            Status = status;
        }
    }

    public class AgentDeviceDto
    {
        public long id { get; set; }
        public string name { get; set; }
        public string platform { get; set; }
        public string agentVersion { get; set; }
    }

    public class UserDto
    {
        public long id { get; set; }
        public string name { get; set; }
        public string email { get; set; }
    }

    public class PersonDto
    {
        public long id { get; set; }
        public string name { get; set; }
        public string role { get; set; }
    }

    public class RemoteSessionDto
    {
        public long id { get; set; }
        public string status { get; set; }
        public string ticketRef { get; set; }
        public PersonDto requestedBy { get; set; }
        public PersonDto customer { get; set; }
        public AgentDeviceDto agent { get; set; }
        public string createdAt { get; set; }
        public string approvedAt { get; set; }
        public string startedAt { get; set; }
        public string expiresAt { get; set; }
    }

    public class InputEventDto
    {
        public string t { get; set; }
        public double x { get; set; }
        public double y { get; set; }
        public int b { get; set; }
        public double d { get; set; }
        public string k { get; set; }
        public string c { get; set; }
    }

    public class PollResponse
    {
        public AgentDeviceDto device { get; set; }
        public List<RemoteSessionDto> sessions { get; set; }
        public RemoteSessionDto session { get; set; }
        public List<InputEventDto> commands { get; set; }
        public string serverTime { get; set; }
    }

    public class PairResponse
    {
        public string token { get; set; }
        public string serverUrl { get; set; }
        public AgentDeviceDto device { get; set; }
        public UserDto user { get; set; }
    }

    public class AnswerResponse
    {
        public RemoteSessionDto remoteSession { get; set; }
        public bool allowed { get; set; }
    }

    public class HttpApi
    {
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();

        public string BaseUrl { get; private set; }
        public string Token { get; set; }

        static HttpApi()
        {
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                ServicePointManager.Expect100Continue = false;
            }
            catch
            {
                // Older runtime: keep the defaults.
            }
        }

        public HttpApi(string baseUrl, string token)
        {
            BaseUrl = NormalizeBaseUrl(baseUrl);
            Token = token;
        }

        public static string NormalizeBaseUrl(string value)
        {
            string url = (value ?? "").Trim();
            if (url.Length == 0) throw new ArgumentException("Enter the SupportIQ server address.");
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                && !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                url = "http://" + url;
            }
            return url.TrimEnd('/');
        }

        public T GetJson<T>(string path, int timeoutMs)
        {
            HttpWebRequest request = CreateRequest("GET", path, timeoutMs);
            return ReadResponse<T>(request);
        }

        public T PostJson<T>(string path, object body, int timeoutMs)
        {
            HttpWebRequest request = CreateRequest("POST", path, timeoutMs);
            request.ContentType = "application/json";
            byte[] data = Encoding.UTF8.GetBytes(serializer.Serialize(body ?? new Dictionary<string, object>()));
            request.ContentLength = data.Length;
            using (Stream stream = request.GetRequestStream())
            {
                stream.Write(data, 0, data.Length);
            }
            return ReadResponse<T>(request);
        }

        public void PostJson(string path, object body, int timeoutMs)
        {
            PostJson<object>(path, body, timeoutMs);
        }

        public void PostBytes(string path, byte[] data, Dictionary<string, string> headers, int timeoutMs)
        {
            HttpWebRequest request = CreateRequest("POST", path, timeoutMs);
            request.ContentType = "image/jpeg";
            request.ContentLength = data.Length;
            if (headers != null)
            {
                foreach (KeyValuePair<string, string> header in headers)
                {
                    request.Headers[header.Key] = header.Value;
                }
            }
            using (Stream stream = request.GetRequestStream())
            {
                stream.Write(data, 0, data.Length);
            }
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                // 204 No Content is the normal reply.
                response.Close();
            }
        }

        private HttpWebRequest CreateRequest(string method, string path, int timeoutMs)
        {
            string url = BaseUrl + (path.StartsWith("/") ? path : "/" + path);
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = method;
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            request.KeepAlive = true;
            request.UserAgent = "SupportIQ-Agent/1.0 (Windows)";
            if (!string.IsNullOrEmpty(Token))
            {
                request.Headers["Authorization"] = "Bearer " + Token;
            }
            return request;
        }

        private T ReadResponse<T>(HttpWebRequest request)
        {
            try
            {
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    string json = reader.ReadToEnd();
                    if (typeof(T) == typeof(string)) return (T)(object)json;
                    if (string.IsNullOrEmpty(json)) return default(T);
                    return serializer.Deserialize<T>(json);
                }
            }
            catch (WebException error)
            {
                HttpWebResponse response = error.Response as HttpWebResponse;
                int status = response == null ? 0 : (int)response.StatusCode;
                string message = error.Message;
                if (response != null)
                {
                    try
                    {
                        using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                        {
                            string body = reader.ReadToEnd();
                            string parsed = ParseError(body);
                            if (!string.IsNullOrEmpty(parsed)) message = parsed;
                        }
                    }
                    catch
                    {
                        // Keep the transport message.
                    }
                }
                throw new ApiException(status, message);
            }
        }

        private string ParseError(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try
            {
                Dictionary<string, object> parsed = serializer.Deserialize<Dictionary<string, object>>(body);
                object value;
                if (parsed != null && parsed.TryGetValue("error", out value) && value != null)
                {
                    return Convert.ToString(value);
                }
            }
            catch
            {
                // Not JSON.
            }
            return null;
        }
    }
}

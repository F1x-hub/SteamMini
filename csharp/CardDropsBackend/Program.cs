using Newtonsoft.Json;
using System;
using System.IO;
using System.Data.SQLite;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CardDropsBackend
{
    class Program
    {
        static async Task Main(string[] args)
        {
            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    var cmd    = JsonConvert.DeserializeObject<Command>(line)!;
                    var result = await HandleAsync(cmd);
                    Console.WriteLine(JsonConvert.SerializeObject(result));
                }
                catch (Exception ex)
                {
                    Console.WriteLine(JsonConvert.SerializeObject(
                        new { reqId = 0, error = ex.Message }));
                }
            }
        }

        static async Task<object> HandleAsync(Command cmd)
        {
            switch (cmd.Action)
            {
                case "get_all_drops":
                    return await GetAllDropsAsync(cmd.ReqId, cmd.SessionId, cmd.LoginSecure, cmd.SteamId);

                case "get_drops_for_app":
                    return await GetDropsForAppAsync(cmd.ReqId, cmd.AppId, cmd.SessionId, cmd.LoginSecure, cmd.SteamId);

                case "debug_cookies":
                    return DebugCookies(cmd.ReqId);

                default:
                    return new { reqId = cmd.ReqId, error = "Unknown action: " + cmd.Action };
            }
        }

        static async Task<object> GetAllDropsAsync(int reqId, string sessionId, string loginSecure, string steamId)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(loginSecure))
                return new { reqId, error = "sessionId / loginSecure not provided" };

            if (string.IsNullOrWhiteSpace(steamId))
                return new { reqId, error = "steamId not provided" };

            Console.Error.WriteLine($"[Cards] Starting parse for steamId={steamId}");

            var parser = new BadgeParser(sessionId, loginSecure);
            var badges = await parser.GetAllBadgesAsync(steamId);

            Console.Error.WriteLine($"[Cards] Done. Found {badges.Count} games with drops");

            return new
            {
                reqId,
                success  = true,
                steamId  = steamId,
                total    = badges.Count,
                games    = badges,
            };
        }

        static async Task<object> GetDropsForAppAsync(int reqId, string appId, string sessionId, string loginSecure, string steamId)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(loginSecure))
                return new { reqId, error = "Cookies not provided" };

            var parser = new BadgeParser(sessionId, loginSecure);
            var badges = await parser.GetAllBadgesAsync(steamId);

            var game = badges.Find(b => b.AppId == appId);
            return new
            {
                reqId,
                success   = true,
                appId,
                remaining = game?.Remaining ?? 0,
                hours     = game?.Hours     ?? 0.0,
            };
        }

        static object DebugCookies(int reqId)
        {
            var localApp = Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData);
            var dbPath   = Path.Combine(localApp, "Steam", "htmlcache",
                                        "Network", "Cookies");
            var tempDb   = Path.Combine(Path.GetTempPath(), "sc_debug.db");

            try
            {
                if (!File.Exists(dbPath))
                    return new { reqId, error = "Cookies DB not found at: " + dbPath };

                File.Copy(dbPath, tempDb, overwrite: true);
                var cs = $"Data Source={tempDb};Version=3;Read Only=True;";
                using (var conn = new SQLiteConnection(cs))
                {
                    conn.Open();

                    // ШАГ 1: Посмотреть ВСЕ уникальные host_key в базе
                    var hosts = new System.Collections.Generic.List<string>();
                    using (var cmd1 = new SQLiteCommand(
                        "SELECT DISTINCT host_key FROM cookies ORDER BY host_key", conn))
                    using (var r1 = cmd1.ExecuteReader())
                        while (r1.Read())
                            hosts.Add(r1.GetString(0));

                    // ШАГ 2: Посмотреть ВСЕ cookie names где host содержит steam
                    var steamCookies = new System.Collections.Generic.List<object>();
                    using (var cmd2 = new SQLiteCommand(@"
                        SELECT name, host_key, 
                               length(value) as val_len, 
                               length(encrypted_value) as enc_len,
                               encrypted_value
                        FROM cookies
                        WHERE lower(host_key) LIKE '%steam%'
                        LIMIT 50", conn))
                    using (var r2 = cmd2.ExecuteReader())
                    {
                        while (r2.Read())
                        {
                            var encLen = r2.IsDBNull(3) ? 0 : r2.GetInt32(3);

                            // Прочитать первые 4 байта encrypted_value
                            string hexPrefix = "";
                            if (encLen > 0)
                            {
                                var buf = new byte[Math.Min(4, encLen)];
                                r2.GetBytes(4, 0, buf, 0, buf.Length);
                                hexPrefix = BitConverter.ToString(buf);
                            }

                            steamCookies.Add(new {
                                name      = r2.GetString(0),
                                host      = r2.GetString(1),
                                valLen    = r2.IsDBNull(2) ? 0 : r2.GetInt32(2),
                                encLen,
                                hexPrefix,
                            });
                        }
                    }

                    conn.Close();

                    return new {
                        reqId,
                        success      = true,
                        totalHosts   = hosts.Count,
                        allHosts     = hosts,
                        steamCookies,
                    };
                }
            }
            catch (Exception ex)
            {
                return new { reqId, error = ex.Message };
            }
            finally { try { if (File.Exists(tempDb)) File.Delete(tempDb); } catch { } }
        }
    }

    class Command
    {
        [JsonProperty("reqId")]       public int    ReqId       { get; set; }
        [JsonProperty("action")]      public string Action      { get; set; } = "";
        [JsonProperty("appId")]       public string AppId       { get; set; } = "";
        [JsonProperty("sessionId")]   public string SessionId   { get; set; } = "";
        [JsonProperty("loginSecure")] public string LoginSecure { get; set; } = "";
        [JsonProperty("steamId")]     public string SteamId     { get; set; } = "";
    }
}

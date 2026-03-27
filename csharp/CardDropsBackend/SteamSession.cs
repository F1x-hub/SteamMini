using Microsoft.Win32;
using Newtonsoft.Json.Linq;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Modes;
using Org.BouncyCastle.Crypto.Parameters;
using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace CardDropsBackend
{
    public class SteamSession
    {
        public string SessionId   { get; private set; } = "";
        public string LoginSecure { get; private set; } = "";
        public string SteamId64   { get; private set; } = "";

        public bool IsReady =>
            !string.IsNullOrWhiteSpace(SessionId)   &&
            !string.IsNullOrWhiteSpace(LoginSecure) &&
            !string.IsNullOrWhiteSpace(SteamId64);

        // Chromium-based браузеры — в порядке приоритета
        private static readonly (string Name, string Path)[] _browserProfiles =
        {
            ("Chrome",  @"Google\Chrome\User Data"),
            ("Edge",    @"Microsoft\Edge\User Data"),
            ("Brave",   @"BraveSoftware\Brave-Browser\User Data"),
            ("Chromium",@"Chromium\User Data"),
        };

        public bool Load()
        {
            // 1. SteamID
            SteamId64 = GetActiveSteamId64();
            Console.Error.WriteLine("[Session] SteamID64: " +
                (SteamId64.Length > 0 ? SteamId64 : "NOT FOUND"));

            if (string.IsNullOrWhiteSpace(SteamId64))
                return Fail("Steam is not running or no active user.");

            // 2. Попробовать каждый браузер
            var localApp = Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData);

            foreach (var (name, profilePath) in _browserProfiles)
            {
                var userDataDir = Path.Combine(localApp, profilePath);
                if (!Directory.Exists(userDataDir)) continue;

                Console.Error.WriteLine($"[Session] Trying {name}...");

                // Попробовать Default и другие профили
                var profiles = new List<string> { "Default" };
                try
                {
                    foreach (var dir in Directory.GetDirectories(userDataDir, "Profile *"))
                        profiles.Add(Path.GetFileName(dir));
                }
                catch { }

                foreach (var profile in profiles)
                {
                    var cookiesDb  = Path.Combine(userDataDir, profile,
                                        "Network", "Cookies");
                    // Старый путь (до Chrome 96)
                    if (!File.Exists(cookiesDb))
                        cookiesDb = Path.Combine(userDataDir, profile, "Cookies");

                    var localState = Path.Combine(userDataDir, "Local State");

                    if (!File.Exists(cookiesDb) || !File.Exists(localState))
                        continue;

                    Console.Error.WriteLine(
                        $"[Session] Found {name}/{profile} cookies DB");

                    var key = GetEncryptionKey(localState);
                    if (key == null)
                    {
                        Console.Error.WriteLine(
                            $"[Session] Could not read encryption key for {name}");
                        continue;
                    }

                    ReadCookiesFromDb(cookiesDb, key, name);

                    if (IsReady)
                    {
                        Console.Error.WriteLine(
                            $"[Session] Cookies found in {name}/{profile}!");
                        return true;
                    }
                }
            }

            return Fail(
                "sessionid / steamLoginSecure not found.\n" +
                "Make sure Chrome/Edge/Brave is open and you are logged into Steam.");
        }

        // Получить AES ключ из Local State (DPAPI расшифровка)
        private static byte[]? GetEncryptionKey(string localStatePath)
        {
            try
            {
                var json      = File.ReadAllText(localStatePath);
                var jobj      = JObject.Parse(json);
                var encKeyB64 = jobj["os_crypt"]?["encrypted_key"]?.ToString();

                if (string.IsNullOrWhiteSpace(encKeyB64)) return null;

                var encKey    = Convert.FromBase64String(encKeyB64);

                // Убрать prefix "DPAPI" (5 байт)
                if (encKey.Length < 5) return null;
                var encKeyData = new byte[encKey.Length - 5];
                Array.Copy(encKey, 5, encKeyData, 0, encKeyData.Length);

                // Расшифровать AES ключ через DPAPI
                return ProtectedData.Unprotect(
                    encKeyData, null, DataProtectionScope.CurrentUser);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Session] GetEncryptionKey error: " + ex.Message);
                return null;
            }
        }

        // Читать куки из Chromium SQLite DB
        private void ReadCookiesFromDb(string dbPath, byte[] aesKey, string browserName)
        {
            var tempDb = Path.Combine(Path.GetTempPath(),
                $"sc_{browserName}_{Guid.NewGuid():N}.db");
            try
            {
                File.Copy(dbPath, tempDb, overwrite: true);

                var cs = $"Data Source={tempDb};Version=3;Read Only=True;";
                using var conn = new SQLiteConnection(cs);
                conn.Open();

                var sql = @"
                    SELECT name, host_key, value, encrypted_value
                    FROM cookies
                    WHERE (host_key = 'steamcommunity.com'
                        OR host_key = '.steamcommunity.com'
                        OR host_key = 'store.steampowered.com')
                      AND (name = 'sessionid' OR name = 'steamLoginSecure')";

                using var cmd    = new SQLiteCommand(sql, conn);
                using var reader = cmd.ExecuteReader();

                while (reader.Read())
                {
                    var name  = reader.GetString(0);
                    var host  = reader.GetString(1);
                    var plain = reader.IsDBNull(2) ? "" : reader.GetString(2);

                    byte[]? enc = null;
                    if (!reader.IsDBNull(3))
                    {
                        var len = (int)reader.GetBytes(3, 0, null, 0, 0);
                        enc     = new byte[len];
                        reader.GetBytes(3, 0, enc, 0, len);
                    }

                    var value = DecryptCookieValue(plain, enc, aesKey);

                    Console.Error.WriteLine(
                        $"[Session] [{browserName}] {name} @ {host}: " +
                        (value.Length > 0 ? $"len={value.Length}" : "EMPTY"));

                    if (name == "sessionid"        && value.Length > 0
                        && SessionId.Length == 0)
                        SessionId = value;

                    if (name == "steamLoginSecure" && value.Length > 0
                        && LoginSecure.Length == 0)
                        LoginSecure = value;
                }

                conn.Close();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Session] ReadCookies error: " + ex.Message);
            }
            finally
            {
                try { if (File.Exists(tempDb)) File.Delete(tempDb); } catch { }
            }
        }

        // Расшифровать значение куки — v10 AES-GCM или DPAPI
        private static string DecryptCookieValue(
            string plain, byte[]? encrypted, byte[] aesKey)
        {
            // Plaintext — сразу вернуть
            if (!string.IsNullOrWhiteSpace(plain)) return plain;
            if (encrypted == null || encrypted.Length < 3) return "";

            var prefix = Encoding.ASCII.GetString(encrypted, 0, 3);

            if (prefix == "v10" || prefix == "v11")
            {
                // Chromium AES-GCM:
                // [3 bytes prefix][12 bytes nonce][ciphertext][16 bytes tag]
                try
                {
                    const int nonceLen = 12;
                    const int tagLen   = 16;
                    const int overhead = 3 + nonceLen + tagLen;

                    if (encrypted.Length <= overhead) return "";

                    var nonce      = new byte[nonceLen];
                    var cipherLen  = encrypted.Length - 3 - nonceLen - tagLen;
                    var ciphertext = new byte[cipherLen + tagLen]; // BC ожидает cipher+tag вместе

                    Array.Copy(encrypted, 3,            nonce,      0, nonceLen);
                    Array.Copy(encrypted, 3 + nonceLen, ciphertext, 0, cipherLen + tagLen);

                    // AES-GCM через BouncyCastle
                    var keyParam   = new KeyParameter(aesKey);
                    var gcmParams  = new AeadParameters(keyParam, tagLen * 8, nonce);
                    var gcmBlockCipher = new GcmBlockCipher(new AesEngine());
                    gcmBlockCipher.Init(false, gcmParams);

                    var output = new byte[gcmBlockCipher.GetOutputSize(ciphertext.Length)];
                    var len    = gcmBlockCipher.ProcessBytes(ciphertext, 0, ciphertext.Length,
                                                     output, 0);
                    gcmBlockCipher.DoFinal(output, len);

                    return Encoding.UTF8.GetString(output);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("[Session] AES-GCM decrypt error: " + ex.Message);
                    return "";
                }
            }
            else
            {
                // Старый DPAPI (Chrome < 80)
                try
                {
                    var decrypted = ProtectedData.Unprotect(
                        encrypted, null, DataProtectionScope.CurrentUser);
                    return Encoding.UTF8.GetString(decrypted);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("[Session] DPAPI decrypt error: " + ex.Message);
                    return "";
                }
            }
        }

        private static string GetActiveSteamId64()
        {
            // Вариант 1: реестр ActiveProcess
            try
            {
                using var key = Registry.CurrentUser
                    .OpenSubKey(@"Software\Valve\Steam\ActiveProcess");
                var val = key?.GetValue("ActiveUser")?.ToString();
                if (!string.IsNullOrWhiteSpace(val) && val != "0")
                    return (long.Parse(val) + 76561197960265728L).ToString();
            }
            catch { }

            // Вариант 2: loginusers.vdf — MostRecent = 1
            try
            {
                using var regKey = Registry.CurrentUser
                    .OpenSubKey(@"Software\Valve\Steam");
                var steamPath   = regKey?.GetValue("SteamPath")?.ToString()
                                         ?.Replace("/", "\\");
                if (steamPath == null) return "";

                var loginUsers = Path.Combine(steamPath, "config", "loginusers.vdf");
                if (!File.Exists(loginUsers)) return "";

                var content    = File.ReadAllText(loginUsers);

                // MostRecent пользователь
                var m = Regex.Match(content,
                    @"""(\d{17})""\s*\{[^}]*""MostRecent""\s+""1""",
                    RegexOptions.Singleline);
                if (m.Success) return m.Groups[1].Value;

                // Любой первый SteamID64
                m = Regex.Match(content, @"""(\d{17})""");
                if (m.Success) return m.Groups[1].Value;
            }
            catch { }

            return "";
        }

        private static bool Fail(string msg)
        {
            Console.Error.WriteLine("[SteamSession] FAIL: " + msg);
            return false;
        }
    }
}

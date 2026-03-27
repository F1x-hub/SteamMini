using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace CardDropsBackend
{
    public class BadgeInfo
    {
        public string AppId       { get; set; } = "";
        public string Name        { get; set; } = "";
        public int    Remaining   { get; set; }
        public double Hours       { get; set; }
    }

    public class BadgeParser
    {
        private readonly HttpClient _http;

        // Appid-ы специальных значков — пропускать, точно как в IME
        private static readonly HashSet<string> _skipAppIds = new()
        {
            "368020", "335590"
        };

        public BadgeParser(string sessionId, string loginSecure)
        {
            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                AllowAutoRedirect      = true,   // ← БЫЛО false, СТАЛО true
                UseCookies             = false,  // ← куки из заголовка, не из CookieContainer
            };

            _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };

            _http.DefaultRequestHeaders.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Safari/537.36");
            _http.DefaultRequestHeaders.Add("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            _http.DefaultRequestHeaders.Add("Accept-Language", "en-US,en;q=0.9");

            // Собрать cookie строку
            var cookies = new System.Text.StringBuilder();
            if (!string.IsNullOrWhiteSpace(sessionId))
                cookies.Append($"sessionid={sessionId}; ");
            cookies.Append($"steamLoginSecure={loginSecure}; ");
            cookies.Append("Steam_Language=english; ");
            cookies.Append("birthtime=0; ");

            _http.DefaultRequestHeaders.Add("Cookie", cookies.ToString().TrimEnd());

            Console.Error.WriteLine($"[BadgeParser] Cookie header set. loginSecure length={loginSecure.Length}");
        }

        /// <summary>
        /// Получить все игры с оставшимися карточками.
        /// Логика парсинга взята из IME frmMain.cs: GetBadgePageAsync + парсинг badge_row
        /// </summary>
        public async Task<List<BadgeInfo>> GetAllBadgesAsync(string steamId64)
        {
            Console.Error.WriteLine($"[BadgeParser] Starting for steamId={steamId64}");

            var url  = $"https://steamcommunity.com/profiles/{steamId64}/badges/?l=english&p=1";
            var html = await FetchPageAsync(url);

            if (html == null)
            {
                Console.Error.WriteLine("[BadgeParser] Failed to fetch page");
                return new List<BadgeInfo>();
            }

            Console.Error.WriteLine($"[BadgeParser] Page 1 loaded, length={html.Length}");

            // Правильные признаки что НЕ залогинен
            var notLoggedInMarkers = new[]
            {
                "g_steamID = false",
                "\"steamid\":false",
                "login?redir=",
                "Please login to view this page",
            };

            foreach (var marker in notLoggedInMarkers)
            {
                if (html.Contains(marker))
                {
                    Console.Error.WriteLine($"[BadgeParser] NOT LOGGED IN — marker: '{marker}'");
                    return new List<BadgeInfo>();
                }
            }

            // Логировать первые 500 символов для диагностики
            Console.Error.WriteLine("[BadgeParser] Page preview: " +
                html.Substring(0, Math.Min(500, html.Length))
                    .Replace("\n", " ").Replace("\r", ""));

            var totalPages = ParseTotalPages(html);
            Console.Error.WriteLine($"[BadgeParser] Total pages: {totalPages}");

            var result = new List<BadgeInfo>();
            ParseBadgePage(html, result);

            // Остальные страницы
            for (int page = 2; page <= totalPages; page++)
            {
                await Task.Delay(500);
                var pageUrl  = $"https://steamcommunity.com/profiles/{steamId64}/badges/?l=english&p={page}";
                var pageHtml = await FetchPageAsync(pageUrl);
                if (pageHtml != null)
                    ParseBadgePage(pageHtml, result);
            }

            Console.Error.WriteLine($"[BadgeParser] Done. Found {result.Count} games with drops");
            return result;
        }

        // Парсинг одной страницы — скопировано из IME frmMain.cs
        private static void ParseBadgePage(string html, List<BadgeInfo> result)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            // Все строки значков — IME ищет именно badge_row
            var rows = doc.DocumentNode.SelectNodes(
                "//div[contains(@class,'badge_row')]");
            if (rows == null) return;

            foreach (var badge in rows)
            {
                try
                {
                    // appId из ссылки overlay — точно как в IME
                    var overlayNode = badge.SelectSingleNode(
                        ".//a[@class=\"badge_row_overlay\"]");
                    if (overlayNode == null) continue;

                    var href  = overlayNode.GetAttributeValue("href", "");
                    var appId = Regex.Match(href, @"gamecards/(\d+)/")
                                     .Groups[1].Value;

                    // Пропустить специальные значки — точно как в IME
                    if (string.IsNullOrWhiteSpace(appId)) continue;
                    if (_skipAppIds.Contains(appId))       continue;
                    if (href.Contains("border=1"))         continue;

                    // Оставшиеся карточки — IME читает progress_info_bold
                    var cardNode = badge.SelectSingleNode(
                        ".//span[@class=\"progress_info_bold\"]");
                    if (cardNode == null) continue;

                    var cardText = cardNode.InnerText.Trim();

                    // \"No card drops remaining\" — пропустить
                    if (cardText.Contains("No card drops")) continue;

                    // Парсить число — \"3 card drops remaining\"
                    var cardMatch = Regex.Match(cardText, @"(\d+)\s+card drop");
                    if (!cardMatch.Success) continue;

                    var remaining = int.Parse(cardMatch.Groups[1].Value);
                    if (remaining <= 0) continue;

                    // Часы — IME читает badge_title_stats_playtime
                    var hoursNode  = badge.SelectSingleNode(
                        ".//div[@class=\"badge_title_stats_playtime\"]");
                    var hoursText  = hoursNode?.InnerText ?? "";
                    var hoursMatch = Regex.Match(hoursText, @"([\d.,]+)\s+hrs");
                    var hours      = hoursMatch.Success
                        ? double.Parse(
                            hoursMatch.Groups[1].Value.Replace(",", "."),
                            CultureInfo.InvariantCulture)
                        : 0.0;

                    // Название — IME читает badge_title -> FirstChild
                    var nameNode = badge.SelectSingleNode(
                        ".//div[@class=\"badge_title\"]");
                    var name     = nameNode?.FirstChild != null
                        ? WebUtility.HtmlDecode(
                            nameNode.FirstChild.InnerText.Trim())
                        : "";

                    result.Add(new BadgeInfo
                    {
                        AppId     = appId,
                        Name      = name,
                        Remaining = remaining,
                        Hours     = hours,
                    });
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("[BadgeParser] Row error: " + ex.Message);
                }
            }
        }

        // Определить общее кол-во страниц из пагинации
        private static int ParseTotalPages(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var pageLinks = doc.DocumentNode.SelectNodes(
                "//a[contains(@class,'pagelink')]");
            if (pageLinks == null) return 1;

            int max = 1;
            foreach (var link in pageLinks)
            {
                if (int.TryParse(link.InnerText.Trim(), out int n) && n > max)
                    max = n;
            }
            return max;
        }

        private async Task<string?> FetchPageAsync(string url, int retries = 3)
        {
            for (int i = 0; i < retries; i++)
            {
                try
                {
                    var response = await _http.GetAsync(url);

                    Console.Error.WriteLine(
                        $"[BadgeParser] GET {url.Substring(0, Math.Min(80, url.Length))} → {(int)response.StatusCode}");

                    // Проверить только финальный URL после всех редиректов
                    var finalUrl = response.RequestMessage?.RequestUri?.ToString() ?? "";
                    if (finalUrl.Contains("/login"))
                    {
                        Console.Error.WriteLine("[BadgeParser] Redirected to login — cookies invalid");
                        return null;
                    }

                    response.EnsureSuccessStatusCode();
                    return await response.Content.ReadAsStringAsync();
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[BadgeParser] Attempt {i+1}: {ex.Message}");
                    if (i < retries - 1) await Task.Delay(1000 * (i + 1));
                }
            }
            return null;
        }
    }
}

using System;
using System.Collections.Generic;
using System.Threading;
using System.Text.Json;
using SAM.API;

class Program
{
    static Client _client;
    static uint _currentAppId;

    static void Main(string[] args)
    {
        Thread.Sleep(300);

        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        string line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                var cmd = JsonSerializer.Deserialize<Command>(line, options);
                if (cmd == null)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        error = "Invalid command payload"
                    }));
                    continue;
                }
                var result = HandleCommand(cmd);
                var response = new {
                    reqId = cmd.ReqId,
                    action = cmd.Action,
                    result = result
                };
                Console.WriteLine(JsonSerializer.Serialize(response));
                
                if (cmd.Action == "close")
                {
                    Console.Out.Flush();
                    Environment.Exit(0);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(JsonSerializer.Serialize(new {
                    error = ex.Message
                }));
            }
        }
    }

    static object HandleCommand(Command cmd)
    {
        switch (cmd.Action)
        {
            // Загрузить достижения игры
            case "load":
                return LoadAchievements(cmd.AppId);

            // Разблокировать достижение
            case "unlock":
                return SetAchievement(cmd.AppId, cmd.AchievementId, true);

            // Заблокировать достижение
            case "lock":
                return SetAchievement(cmd.AppId, cmd.AchievementId, false);

            // Разблокировать все
            case "unlock_all":
                return UnlockAll(cmd.AppId);

            // Закрыть сессию игры
            case "close":
                return CloseGame();

            default:
                return new { error = "Unknown action" };
        }
    }

    static object LoadAchievements(uint appId)
    {
        if (!EnsureClient(appId, out var error))
        {
            Console.Error.WriteLine($"[SAMBackend] EnsureClient failed for {appId}: {error}");
            return new { error };
        }

        var stats = _client.SteamUserStats;
        // 1. Сначала один быстрый запрос без ожидания
        int count = stats.GetNumAchievements();
        
        if (count == 0)
        {
            Thread.Sleep(1500);
            count = stats.GetNumAchievements();
        }

        if (count == 0)
        {
            Thread.Sleep(1500);
            count = stats.GetNumAchievements();
        }

        if (count == 0)
        {
            // Игра без достижений — не логировать как ошибку
            Console.Error.WriteLine($"[SAMBackend] No achievements for appId {appId}");
            // Вернуть пустой список без ретраев
            return new { success = true, achievements = Array.Empty<object>() };
        }

        Console.Error.WriteLine($"[SAMBackend] GetNumAchievements: {count} for appId {appId}");
        var achievements = new List<object>(count > 0 ? count : 0);

        for (var i = 0; i < count; i++)
        {
            var id = stats.GetAchievementName(i);
            if (string.IsNullOrEmpty(id))
                continue;

            stats.GetAchievementAndUnlockTime(id, out var isAchieved, out var unlockTime);

            var name = stats.GetAchievementDisplayAttribute(id, "name");
            var description = stats.GetAchievementDisplayAttribute(id, "desc");
            var hiddenRaw = stats.GetAchievementDisplayAttribute(id, "hidden");
            var hidden = hiddenRaw == "1";

            var iconName = stats.GetAchievementDisplayAttribute(id, "icon");
            var iconLockedName = stats.GetAchievementDisplayAttribute(id, "icon_gray");

            achievements.Add(new
            {
                id,
                name = string.IsNullOrWhiteSpace(name) ? id : name,
                description,
                unlocked = isAchieved,
                unlockedAt = unlockTime,
                iconUrl = string.IsNullOrEmpty(iconName)
                    ? null
                    : $"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/{appId}/{iconName}",
                iconLockedUrl = string.IsNullOrEmpty(iconLockedName)
                    ? null
                    : $"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/{appId}/{iconLockedName}",
                hidden
            });
        }

        Console.Error.WriteLine($"[SAMBackend] Final achievements list size: {achievements.Count}");
        return new { success = true, achievements };
    }

    static object SetAchievement(uint appId, string achievementId, bool unlock)
    {
        if (!EnsureClient(appId, out var error))
            return new { error };

        var stats = _client.SteamUserStats;

        if (!stats.GetAchievementAndUnlockTime(achievementId, out _, out _))
            return new { error = $"Achievement {achievementId} not found" };

        if (!stats.SetAchievement(achievementId, unlock))
            return new { error = $"Failed to update achievement {achievementId}" };

        if (!stats.StoreStats())
            return new { error = "Failed to store stats" };

        return new { success = true, id = achievementId, unlocked = unlock };
    }

    static object UnlockAll(uint appId)
    {
        if (!EnsureClient(appId, out var error))
            return new { error };

        var stats = _client.SteamUserStats;
        var count = stats.GetNumAchievements();

        for (var i = 0; i < count; i++)
        {
            var id = stats.GetAchievementName(i);
            if (string.IsNullOrEmpty(id))
                continue;

            stats.SetAchievement(id, true);
        }

        if (!stats.StoreStats())
            return new { error = "Failed to store stats" };

        return new { success = true, count };
    }

    static object CloseGame()
    {
        try
        {
            if (_client != null)
            {
                _client.Dispose();
                _client = null;
                _currentAppId = 0;
                Console.Error.WriteLine("[SAMBackend] Game session closed via request");
            }
            return new { success = true };
        }
        catch (Exception ex)
        {
            return new { error = ex.Message };
        }
    }

    static bool EnsureClient(uint appId, out string error)
    {
        error = null;

        if (_client != null && _currentAppId == appId)
            return true;

        _client?.Dispose();
        _client = new Client();

        try
        {
            _client.Initialize(appId);
            _currentAppId = appId;
            return true;
        }
        catch (Exception ex)
        {
            _client.Dispose();
            _client = null;

            var message = ex.Message;

            if (ex is ClientInitializeException cie)
            {
                message = $"Initialize failure: {cie.Failure}: {cie.Message}";
            }

            try
            {
                var installPath = Steam.GetInstallPath();
                if (string.IsNullOrEmpty(installPath))
                    message += " | Steam install path not found.";
                else
                    message += $" | Steam install path: {installPath}";
            }
            catch
            {
            }

            Console.Error.WriteLine($"[SAMBackend] Initialize error: {message}");

            error = message;
            return false;
        }
    }
}

// Модель команды
class Command
{
    public int ReqId { get; set; }
    public string Action { get; set; }
    public uint AppId { get; set; }
    public string AchievementId { get; set; }
}

using Newtonsoft.Json;
using StackExchange.Redis;
using Syncfusion.EJ2.DocumentEditor;
using CollaborativeEditingServerSide.Model;

namespace CollaborativeEditingServerSide.Service
{
    /// <summary>
    /// Shared service that loads the static user directory from
    /// <c>wwwroot/Data/users.json</c> and combines it with the live presence
    /// information stored in Redis to produce profile records whose
    /// <c>onlineStatus</c> reflects whether the user is currently in a session.
    /// </summary>
    public class UserDirectoryService
    {
        private readonly IWebHostEnvironment _hostingEnvironment;
        private readonly IConnectionMultiplexer _redisConnection;
        private static Dictionary<string, UserProfileEntry>? _staticDirectory;
        private static readonly object _lock = new();

        public UserDirectoryService(
            IWebHostEnvironment hostingEnvironment,
            IConnectionMultiplexer redisConnection)
        {
            _hostingEnvironment = hostingEnvironment;
            _redisConnection = redisConnection;
        }

        /// <summary>
        /// Returns the full list of users, decorated with a live
        /// <c>onlineStatus</c> ("Online" if the user is currently connected
        /// to any room, "Offline" otherwise).
        /// </summary>
        public List<UserProfileEntry> GetUsers()
        {
            EnsureLoaded();
            var onlineNames = GetOnlineUserNames();

            var result = new List<UserProfileEntry>();
            foreach (var entry in _staticDirectory!.Values)
            {
                if (string.IsNullOrWhiteSpace(entry.Name)) continue;
                var nameKey = entry.Name.Trim().ToLowerInvariant();
                result.Add(new UserProfileEntry
                {
                    Id = entry.Id,
                    Name = entry.Name,
                    Initials = entry.Initials,
                    ProfileIcon = entry.ProfileIcon,
                    OnlineStatus = onlineNames.Contains(nameKey) ? "Online" : "Offline",
                    Email = entry.Email,
                    Organization = entry.Organization,
                    UserRole = entry.UserRole,
                });
            }
            return result;
        }

        /// <summary>
        /// Looks up a single user profile by display name. Returns <c>null</c>
        /// if the name is not present in the directory. The returned record's
        /// <c>onlineStatus</c> reflects live presence.
        /// </summary>
        public UserProfileEntry? FindByName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            EnsureLoaded();
            var key = name.Trim().ToLowerInvariant();
            if (!_staticDirectory!.TryGetValue(key, out var entry) || entry == null) return null;

            return new UserProfileEntry
            {
                Id = entry.Id,
                Name = entry.Name,
                Initials = entry.Initials,
                ProfileIcon = entry.ProfileIcon,
                OnlineStatus = IsUserOnline(entry.Name) ? "Online" : "Offline",
                Email = entry.Email,
                Organization = entry.Organization,
                UserRole = entry.UserRole,
            };
        }

        /// <summary>True if a user with the given name is currently connected to any room.</summary>
        public bool IsUserOnline(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            return GetOnlineUserNames().Contains(name.Trim().ToLowerInvariant());
        }

        /// <summary>
        /// Scans every room's user-info hash in Redis and returns the set of
        /// user names that are currently connected. O(N) over rooms, but rooms
        /// are typically few and the hash entries are small.
        /// </summary>
        private HashSet<string> GetOnlineUserNames()
        {
            var online = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var db = _redisConnection.GetDatabase();
                // Iterate the connection-id → room-name mapping to find all live rooms.
                var mappingEntries = db.HashGetAll(CollaborativeEditingHelper.ConnectionIdRoomMappingKey);
                foreach (var mapping in mappingEntries)
                {
                    var roomName = mapping.Value.ToString();
                    var hashEntries = db.HashGetAll(roomName + CollaborativeEditingHelper.UserInfoSuffix);
                    foreach (var hashEntry in hashEntries)
                    {
                        try
                        {
                            var info = JsonConvert.DeserializeObject<ActionInfo>(hashEntry.Value!);
                            if (info != null && !string.IsNullOrWhiteSpace(info.CurrentUser))
                            {
                                online.Add(info.CurrentUser.Trim().ToLowerInvariant());
                            }
                        }
                        catch
                        {
                            // ignore corrupt entry
                        }
                    }
                }
            }
            catch
            {
                // If Redis is unavailable, fall through with an empty set.
            }
            return online;
        }

        private void EnsureLoaded()
        {
            if (_staticDirectory != null) return;

            lock (_lock)
            {
                if (_staticDirectory != null) return;

                _staticDirectory = new Dictionary<string, UserProfileEntry>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    var webRoot = _hostingEnvironment.WebRootPath;
                    if (string.IsNullOrEmpty(webRoot)) return;
                    var path = Path.Combine(webRoot, "Data", "users.json");
                    if (!File.Exists(path)) return;

                    var json = File.ReadAllText(path);
                    var directory = JsonConvert.DeserializeObject<UserDirectoryPayload>(json);
                    if (directory?.Users == null) return;

                    foreach (var u in directory.Users)
                    {
                        if (string.IsNullOrWhiteSpace(u.Name)) continue;
                        _staticDirectory[u.Name.Trim().ToLowerInvariant()] = u;
                    }
                }
                catch
                {
                    // Non-fatal: missing users.json means no static directory.
                }
            }
        }

        // ── Wire-format DTOs ──────────────────────────────────────────────

        public class UserProfileEntry
        {
            [JsonProperty("id")]
            public string? Id { get; set; }

            [JsonProperty("name")]
            public string? Name { get; set; }

            [JsonProperty("initials")]
            public string? Initials { get; set; }

            [JsonProperty("profileIcon")]
            public string? ProfileIcon { get; set; }

            [JsonProperty("onlineStatus")]
            public string? OnlineStatus { get; set; }

            [JsonProperty("userRole")]
            public string? UserRole { get; set; }

            [JsonProperty("email")]
            public string? Email { get; set; }

            [JsonProperty("organization")]
            public string? Organization { get; set; }
        }

        private class UserDirectoryPayload
        {
            [JsonProperty("users")]
            public List<UserProfileEntry>? Users { get; set; }
        }
    }
}

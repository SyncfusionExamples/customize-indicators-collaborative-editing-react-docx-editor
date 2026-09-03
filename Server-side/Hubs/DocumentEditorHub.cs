using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using StackExchange.Redis;
using Syncfusion.EJ2.DocumentEditor;
using CollaborativeEditingServerSide.Model;
using CollaborativeEditingServerSide.Service;

namespace CollaborativeEditingServerSide.Hubs
{
    public class DocumentEditorHub : Hub
    {
        private readonly IDatabase _db;
        private readonly UserDirectoryService _userDirectory;
        private IBackgroundTaskQueue saveTaskQueue;

        public DocumentEditorHub(
            IConnectionMultiplexer redisConnection,
            IBackgroundTaskQueue taskQueue,
            UserDirectoryService userDirectory)
        {
            _db = redisConnection.GetDatabase();
            saveTaskQueue = taskQueue;
            _userDirectory = userDirectory;
        }

        // Called when a new connection is established
        public override Task OnConnectedAsync()
        {
            // Send session id to client.
            Clients.Caller.SendAsync("dataReceived", "connectionId", Context.ConnectionId);
            return base.OnConnectedAsync();
        }

        // Handles a user joining a group (room) for document editing
        public async Task JoinGroup(ActionInfo info)
        {
            // Set the connection ID to info
            info.ConnectionId = Context.ConnectionId;
            // Add the connection ID to the group
            await Groups.AddToGroupAsync(Context.ConnectionId, info.RoomName);

            // Look up the static profile (id, profileIcon, userRole) from
            // users.json. We do NOT use reflection on ActionInfo (the fields
            // don't exist on that type, so silent no-ops were leaving the
            // receive-side without avatar data). Instead we attach the
            // profile as a separate payload next to the ActionInfo below.
            var profile = _userDirectory.FindByName(info.CurrentUser);

            // To ensure whether the room exists in the Redis cache
            bool roomExists = await _db.KeyExistsAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix);
            if (roomExists)
            {
                // Fetch all connected users from Redis
                var allUsers = await _db.HashGetAllAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix);
                var userList = allUsers.Select(u => JsonConvert.DeserializeObject<ActionInfo>(u.Value!)).ToList();

                // Send the existing user details to the newly joined user.
                // Each entry is wrapped with its profile (id, profileIcon,
                // userRole, onlineStatus) so the receive-side can render the
                // avatar without having to re-fetch the user directory.
                var wrappedList = userList.Select(u => WrapWithProfile(u)).ToList();
                await Clients.Caller.SendAsync("dataReceived", "addUser", wrappedList);
            }

            // Add user to Redis (the bare ActionInfo — room + name +
            // connectionId — is enough for Redis presence).
            await _db.HashSetAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix, Context.ConnectionId, JsonConvert.SerializeObject(info));

            // Store the room name with the connection ID
            await _db.HashSetAsync(CollaborativeEditingHelper.ConnectionIdRoomMappingKey, Context.ConnectionId, info.RoomName);

            // Notify all the existing users in the group about the new user.
            // Wrap the ActionInfo with the profile so peers can render the
            // avatar without round-tripping to the user directory.
            await Clients.GroupExcept(info.RoomName, Context.ConnectionId)
                .SendAsync("dataReceived", "addUser", WrapWithProfile(info, profile));
        }

        /// <summary>
        /// Wraps an <see cref="ActionInfo"/> with the profile fields the
        /// client needs to render an avatar (id, profileIcon, userRole,
        /// onlineStatus). The ActionInfo itself is preserved under the
        /// <c>actionInfo</c> key so the existing collab-editing pipeline
        /// continues to work, and the profile fields ride alongside as
        /// peers via the JSON-serialized anonymous object.
        /// </summary>
        private object WrapWithProfile(ActionInfo info, Service.UserDirectoryService.UserProfileEntry? profile = null)
        {
            profile ??= _userDirectory.FindByName(info.CurrentUser);
            return new
            {
                // Preserve the original ActionInfo so the collaborative-editing
                // handler can still apply it as a remote action.
                actionInfo = info,
                // Profile fields the receive-side title bar reads directly.
                connectionId = info.ConnectionId,
                currentUser = info.CurrentUser,
                userId = profile?.Id,
                profileIcon = profile?.ProfileIcon,
                userRole = profile?.UserRole,
                onlineStatus = "Online", // anyone with an active session is online
            };
        }

        // Called when a user disconnects from the hub
        public override async Task OnDisconnectedAsync(Exception? e)
        {
            var roomNameValue = await _db.HashGetAsync(
                CollaborativeEditingHelper.ConnectionIdRoomMappingKey,
                Context.ConnectionId
            );

            if (roomNameValue.IsNullOrEmpty)
            {
                return; // nothing to clean up
            }

            string roomName = roomNameValue.ToString();

            await _db.HashDeleteAsync(roomName + CollaborativeEditingHelper.UserInfoSuffix, Context.ConnectionId);

            //// Fetch all connected users from Redis
            var allUsers = await _db.HashGetAllAsync(roomName + CollaborativeEditingHelper.UserInfoSuffix);

            var userList = allUsers.Select(u => JsonConvert.DeserializeObject<ActionInfo>(u.Value!)).ToList();

            // Remove connection to room name mapping
            await _db.HashDeleteAsync(CollaborativeEditingHelper.ConnectionIdRoomMappingKey, Context.ConnectionId);


            if (userList.Count == 0)
            {
                // Auto save the pending operations to source document
                RedisValue[] pendingOps = await _db.ListRangeAsync(roomName, 0, -1);
                if (pendingOps.Length > 0)
                {
                    List<ActionInfo> actions = new List<ActionInfo>();
                    // Prepare the message fir adding it in background service queue.
                    foreach (var element in pendingOps)
                    {
                        actions.Add(JsonConvert.DeserializeObject<ActionInfo>(element.ToString())!);
                    }
                    var message = new SaveInfo
                    {
                        Action = actions,
                        PartialSave = false,
                        RoomName = roomName,
                    };
                    // Queue the message for background processing and save the operations to source document in background task
                    _ = saveTaskQueue.QueueBackgroundWorkItemAsync(message);
                }
            }
            else
            {
                // Notify remaining clients about the user disconnection
                await Clients.Group(roomName!).SendAsync("dataReceived", "removeUser", Context.ConnectionId);
            }
            await base.OnDisconnectedAsync(e);
        }

        // ─────────────────────────────────────────────────────────────────
        // Profile enrichment
        //
        // Looks up the static profile (id, profileIcon) from users.json via
        // the shared UserDirectoryService and *always* sets OnlineStatus to
        // "Online" — anyone with an active session is, by definition, online.
        // ─────────────────────────────────────────────────────────────────
        private void EnrichWithProfile(ActionInfo info)
        {
            if (info == null) return;

            var profile = _userDirectory.FindByName(info.CurrentUser);
            if (profile != null)
            {
                TrySetProperty(info, "UserId", profile.Id);
                TrySetProperty(info, "ProfileIcon", profile.ProfileIcon);
                TrySetProperty(info, "UserRole", profile.UserRole);
            }

            // Active session participants are always "Online" — we do not
            // maintain Online/Offline flags in users.json any more.
            TrySetProperty(info, "OnlineStatus", "Online");
        }

        private static void TrySetProperty(object target, string propertyName, object? value)
        {
            if (value == null) return;
            var prop = target.GetType().GetProperty(propertyName);
            if (prop == null || !prop.CanWrite) return;
            try
            {
                prop.SetValue(target, value);
            }
            catch
            {
                // Ignore — the property exists but its type didn't match.
            }
        }
    }
}

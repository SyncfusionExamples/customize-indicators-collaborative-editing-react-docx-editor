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

            // Enrich the incoming ActionInfo with profile details from users.json.
            // The user is, by definition, "Online" because they just joined.
            EnrichWithProfile(info);

            //To ensure whether the room exixts in the Redis cache
            bool roomExists = await _db.KeyExistsAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix);
            if (roomExists)
            {
                // Fetch all connected users from Redis
                var allUsers = await _db.HashGetAllAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix);
                var userList = allUsers.Select(u => JsonConvert.DeserializeObject<ActionInfo>(u.Value!)).ToList();

                // Enrich existing users with profile info. They are also
                // currently online since they have an active presence record.
                foreach (var u in userList) EnrichWithProfile(u);

                //Send the exisiting user details to the newly joined user.
                await Clients.Caller.SendAsync("dataReceived", "addUser", userList);
            }

            // Add user to Redis
            await _db.HashSetAsync(info.RoomName + CollaborativeEditingHelper.UserInfoSuffix, Context.ConnectionId, JsonConvert.SerializeObject(info));

            // Store the room name with the connection ID
            await _db.HashSetAsync(CollaborativeEditingHelper.ConnectionIdRoomMappingKey, Context.ConnectionId, info.RoomName);

            // Notify all the exsisiting users in the group about the new user
            await Clients.GroupExcept(info.RoomName, Context.ConnectionId).SendAsync("dataReceived", "addUser", info);
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

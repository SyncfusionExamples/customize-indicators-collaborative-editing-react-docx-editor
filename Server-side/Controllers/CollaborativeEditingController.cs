using Microsoft.AspNetCore.Mvc;
using Syncfusion.EJ2.DocumentEditor;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.SignalR;
using CollaborativeEditingServerSide.Hubs;
using StackExchange.Redis;
using Newtonsoft.Json;
using CollaborativeEditingServerSide.Model;
using CollaborativeEditingServerSide.Service;

namespace CollaborativeEditingServerSide.Controllers
{
    /// <summary>
    /// API Controller for handling real-time collaborative editing requests,
    /// such as importing files, updating actions, retrieving actions, and
    /// loading/saving documents from the application's wwwroot folder.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class CollaborativeEditingController : ControllerBase
    {
        private IBackgroundTaskQueue saveTaskQueue;
        private static IConnectionMultiplexer? _redisConnection;
        private static IWebHostEnvironment? _hostingEnvironment;
        private readonly IHubContext<DocumentEditorHub> _hubContext;

        // Constructor for the CollaborativeEditingController
        public CollaborativeEditingController(IWebHostEnvironment hostingEnvironment,
            IHubContext<DocumentEditorHub> hubContext,
            IConfiguration config, IConnectionMultiplexer redisConnection, IBackgroundTaskQueue taskQueue)
        {
            _hostingEnvironment = hostingEnvironment;
            _hubContext = hubContext;
            _redisConnection = redisConnection;
            saveTaskQueue = taskQueue;
        }

        /// <summary>
        /// Imports a document from the application's wwwroot folder and applies any pending actions
        /// from Redis to bring it up to date. Returns the final document in SFDT format.
        /// </summary>
        /// <param name="param">File info, including fileName and documentOwner (room ID).</param>
        /// <returns>JSON-serialized DocumentContent with version and SFDT data.</returns>
        [HttpPost]
        [Route("ImportFile")]
        [EnableCors("AllowAllOrigins")]
        public async Task<string?> ImportFile([FromBody] CollaborativeEditingServerSide.Model.FileInfo param)
        {
            try
            {
                // Prepare a container for returning document data
                DocumentContent content = new DocumentContent();
                // Retrieve the source document from wwwroot
                Syncfusion.EJ2.DocumentEditor.WordDocument document = await GetSourceDocumentAsync(param.fileName!);
                // Get any pending actions for this document/room
                List<ActionInfo> actions = await GetPendingOperations(param.documentOwner!, 0, -1);
                if (actions != null && actions.Count > 0)
                {
                    // If pending actions exist, apply them to the document
                    document.UpdateActions(actions);
                }
                // Serialize the updated document to SFDT format
                string sfdt = Newtonsoft.Json.JsonConvert.SerializeObject(document);
                content.version = 0;
                content.sfdt = sfdt;
                // Dispose of the document to free resources
                document.Dispose();
                // Return the serialized content as a JSON string
                return Newtonsoft.Json.JsonConvert.SerializeObject(content);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to import document '{FileName} - '"+ param.fileName);
                Console.WriteLine(ex);
                throw;
            }
        }

        // Updates the action, modifies it if necessary, and notifies clients in the same room about the change
        [HttpPost]
        [Route("UpdateAction")]
        [EnableCors("AllowAllOrigins")]
        public async Task<ActionInfo?> UpdateAction(ActionInfo param)
        {
            // Adds the action to the cache
            ActionInfo modifiedAction = await AddOperationsToCache(param);
            // Sends the updated action to all clients in the room to notify them of the change
            await _hubContext.Clients.Group(param.RoomName).SendAsync("dataReceived", "action", modifiedAction);
            return modifiedAction;
        }

        // Gets the actions that are waiting to be synced or updated, based on the version the client has
        [HttpPost]
        [Route("GetActionsFromServer")]
        [EnableCors("AllowAllOrigins")]
        public async Task<string> GetActionsFromServer(ActionInfo param)
        {
            try
            {
                // Initialize necessary variables from the parameters and helper class
                int saveThreshold = CollaborativeEditingHelper.SaveThreshold;
                string roomName = param.RoomName;
                int lastSyncedVersion = param.Version;
                int clientVersion = param.Version;

                // Retrieve the database connection
                IDatabase database = _redisConnection!.GetDatabase();

                // Fetch actions that are effective and pending based on the last synced version
                List<ActionInfo> actions = await GetEffectivePendingVersion(roomName, lastSyncedVersion, database);

                // Increment the version for each action sequentially
                actions.ForEach(action => action.Version = ++clientVersion);

                // Filter actions to only include those that are newer than the client's last known version
                actions = actions.Where(action => action.Version > lastSyncedVersion).ToList();

                // Transform actions that have not been transformed yet
                actions.Where(action => !action.IsTransformed).ToList()
                    .ForEach(action => CollaborativeEditingHandler.TransformOperation(action, actions));

                // Serialize the filtered and transformed actions to JSON and return
                return Newtonsoft.Json.JsonConvert.SerializeObject(actions);
            }
            catch
            {
                // In case of an exception, return an empty JSON object
                return "{}";
            }
        }

        // Method to add the action to the Redis cache, apply transformations, and handle cleared operations
        private async Task<ActionInfo> AddOperationsToCache(ActionInfo action)
        {
            int clientVersion = action.Version;

            // Initialize the database connection
            IDatabase database = _redisConnection!.GetDatabase();
            // Define the keys for Redis operations based on the action's room name
            RedisKey[] keys = new RedisKey[]
            {
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName, CollaborativeEditingHelper.VersionInfoSuffix),
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName),
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName, CollaborativeEditingHelper.RevisionInfoSuffix),
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName, CollaborativeEditingHelper.ActionsToRemoveSuffix)
            };
            // Serialize the action and prepare values for the Redis script
            RedisValue[] values = new RedisValue[] { JsonConvert.SerializeObject(action), clientVersion.ToString(), CollaborativeEditingHelper.SaveThreshold.ToString() };
            // Execute the Lua script in Redis and store the results
            RedisResult[] results = (RedisResult[])(await database.ScriptEvaluateAsync(CollaborativeEditingHelper.InsertScript, keys, values))!;

            // Parse the version number from the script results
            int version = int.Parse(results[0]!.ToString());
            // Deserialize the list of previous operations from the script results
            List<ActionInfo> previousOperations = ((RedisResult[])results[1]!).Select(value => JsonConvert.DeserializeObject<ActionInfo>(value.ToString())!).ToList();

            // Increment the version for each previous operation
            previousOperations.ForEach(op => op.Version = ++clientVersion);

            // Check if there are multiple previous operations to determine if transformation is needed
            if (previousOperations.Count > 1)
            {
                // Set the current action to the last operation in the list
                action = previousOperations.Last();
                // Transform operations that have not been transformed yet
                previousOperations.Where(op => !op.IsTransformed).ToList().ForEach(op => CollaborativeEditingHandler.TransformOperation(op, previousOperations));
            }
            // Update the action's version and mark it as transformed
            action.Version = version;
            action.IsTransformed = true;
            // Update the record in the cache with the new version
            UpdateRecordToCache(version, action, database);

            // Check if there are cleared operations to be saved
            if (results.Length > 2 && !results[2].IsNull)
            {
                // Deserialize the cleared operations from the results
                RedisResult[] clearedOperation = (RedisResult[])results[2]!;
                List<ActionInfo> actions = new List<ActionInfo>();
                // Prepare the message fir adding it in background service queue.
                foreach (var element in clearedOperation)
                {
                    actions.Add(JsonConvert.DeserializeObject<ActionInfo>(element.ToString())!);
                }
                var message = new SaveInfo
                {
                    Action = actions,
                    PartialSave = true,
                    RoomName = action.RoomName,
                };
                // Queue the message for background processing and save the operations to source document in background task
                _ = saveTaskQueue.QueueBackgroundWorkItemAsync(message);
            }
            // Return the updated action
            return action;
        }

        // Method to update the action record in the Redis cache
        private async void UpdateRecordToCache(int version, ActionInfo action, IDatabase database)
        {
            // Prepare Redis keys for accessing the room and its revision information
            RedisKey[] keys = new RedisKey[]
            {
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName), // Key for the room's main data
                CollaborativeEditingHelper.GetRedisRoomKey(action.RoomName, CollaborativeEditingHelper.RevisionInfoSuffix) // Key for the room's revision data
            };

            // Prepare Redis values for the script execution
            RedisValue[] values = new RedisValue[]
            {
                JsonConvert.SerializeObject(action), // Serialize the action to store/update it in Redis
                (version - 1).ToString(), // Decrement the version to get the previous version for comparison or update
                CollaborativeEditingHelper.SaveThreshold.ToString() // Convert the save threshold to string for Redis
            };

            // Execute the Lua script with the prepared keys and values
            // This script is likely updating the action in the room and possibly handling revision checks or updates
            await database.ScriptEvaluateAsync(CollaborativeEditingHelper.UpdateRecord, keys, values);
        }

        // Method to retrieve effective pending actions from Redis based on the given start index
        private async Task<List<ActionInfo>> GetEffectivePendingVersion(string roomName, int startIndex, IDatabase databse)
        {

            // Define Redis keys for accessing the room data and its revision information
            RedisKey[] keys = new RedisKey[]
            {
                CollaborativeEditingHelper.GetRedisRoomKey(roomName), // Key for the room's actions
                CollaborativeEditingHelper.GetRedisRoomKey(roomName, CollaborativeEditingHelper.RevisionInfoSuffix) // Key for the room's revision data
            };

            // Prepare Redis values for the script: start index and save threshold
            RedisValue[] values = new RedisValue[]
            {
                startIndex.ToString(), // Convert start index to string for Redis command
                CollaborativeEditingHelper.SaveThreshold.ToString() // Convert save threshold to string for Redis command
            };


            var eval = await databse.ScriptEvaluateAsync(CollaborativeEditingHelper.EffectivePendingOperations, keys, values);
            var upcomingActions = (RedisResult[]?)eval ?? Array.Empty<RedisResult>();

            return upcomingActions
                .Select(v => JsonConvert.DeserializeObject<ActionInfo>(v.ToString()))
                .OfType<ActionInfo>() // removes nulls and fixes List<ActionInfo?> warning
                .ToList();

        }

        // Method to retrieve pending operations from a Redis list between specified indexes
        public async Task<List<ActionInfo>> GetPendingOperations(string listKey, long startIndex, long endIndex)
        {
            // Get the database connection from the Redis connection multiplexer
            var db = _redisConnection!.GetDatabase();
            // var result = (RedisResult[])(await db.ScriptEvaluateAsync(CollaborativeEditingHelper.PendingOperations, new RedisKey[] { listKey, listKey + CollaborativeEditingHelper.ActionsToRemoveSuffix }, new RedisValue[] { startIndex, endIndex }))!;
            var result = (RedisResult[])(await db.ScriptEvaluateAsync(CollaborativeEditingHelper.PendingOperations, new RedisKey[] { CollaborativeEditingHelper.GetRedisRoomKey(listKey), CollaborativeEditingHelper.GetRedisRoomKey(listKey, CollaborativeEditingHelper.ActionsToRemoveSuffix) }, new RedisValue[] { startIndex, endIndex }))!;
            var processingValues = (RedisResult[])result[0]!;
            var listValues = (RedisResult[])result[1]!;

            // Initialize the list to hold ActionInfo objects
            var actionInfoList = new List<ActionInfo>();

            // Deserialize the operations from JSON to ActionInfo objects and store in the list
            actionInfoList.AddRange(processingValues.Select(value => Newtonsoft.Json.JsonConvert.DeserializeObject<ActionInfo>(value.ToString())!));

            // Deserialize the operations from JSON to ActionInfo objects and return as a list
            actionInfoList.AddRange(listValues.Select(value => Newtonsoft.Json.JsonConvert.DeserializeObject<ActionInfo>(value.ToString())!));

            return actionInfoList;
        }

        internal static async Task<Syncfusion.EJ2.DocumentEditor.WordDocument> GetSourceDocumentAsync(string documentName)
        {
            // Resolve the document path under the application's wwwroot folder.
            var wwwrootPath = ResolveWwwRootPath();

            var documentPath = Path.Combine(wwwrootPath, documentName);
            if (!System.IO.File.Exists(documentPath))
            {
                throw new FileNotFoundException($"Document '{documentName}' was not found in wwwroot.", documentPath);
            }

            // Load the document from disk into a memory stream.
            MemoryStream stream = new MemoryStream();
            await using (var fileStream = new FileStream(documentPath, FileMode.Open, FileAccess.Read))
            {
                await fileStream.CopyToAsync(stream);
            }
            stream.Position = 0;

            // Determine the file format from the extension.
            int index = documentName.LastIndexOf('.');
            string type = index > -1 && index < documentName.Length - 1 ? documentName.Substring(index) : ".docx";

            // Load the document using the Syncfusion DocumentEditor API.
            Syncfusion.EJ2.DocumentEditor.WordDocument document = Syncfusion.EJ2.DocumentEditor.WordDocument.Load(stream, GetFormatType(type));

            stream.Dispose();
            return document;
        }

        /// <summary>
        /// Resolves the absolute path to the application's wwwroot folder.
        /// Tries the injected <see cref="IWebHostEnvironment"/> first, then falls back
        /// to a relative lookup next to the assembly (used by the background service
        /// which does not have access to the host environment).
        /// </summary>
        private static string ResolveWwwRootPath()
        {
            if (_hostingEnvironment != null && !string.IsNullOrEmpty(_hostingEnvironment.WebRootPath))
            {
                return _hostingEnvironment.WebRootPath!;
            }

            var contentRoot = AppContext.BaseDirectory;
            var wwwrootPath = Path.Combine(contentRoot, "wwwroot");
            if (!Directory.Exists(wwwrootPath))
            {
                // Fall back to the project-level wwwroot when running from the bin folder.
                var candidate = Path.Combine(contentRoot, "..", "..", "..", "wwwroot");
                wwwrootPath = Path.GetFullPath(candidate);
            }
            return wwwrootPath;
        }

        // Determines the format type of the document based on its file extension
        internal static FormatType GetFormatType(string format)
        {
            if (string.IsNullOrEmpty(format))
                throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            switch (format.ToLower())
            {
                case ".dotx":
                case ".docx":
                case ".docm":
                case ".dotm":
                    return FormatType.Docx;
                case ".dot":
                case ".doc":
                    return FormatType.Doc;
                case ".rtf":
                    return FormatType.Rtf;
                case ".txt":
                    return FormatType.Txt;
                case ".xml":
                    return FormatType.WordML;
                case ".html":
                    return FormatType.Html;
                default:
                    throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            }
        }
    }
}

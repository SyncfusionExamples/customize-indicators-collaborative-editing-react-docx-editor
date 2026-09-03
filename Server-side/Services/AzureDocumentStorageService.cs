using Syncfusion.EJ2.FileManager.Base;
using CollaborativeEditingServerSide.Model;

namespace CollaborativeEditingServerSide.Service
{
    public interface IAzureDocumentStorageService
    {
        object ManageDocument(FileManagerDirectoryContent args);
    }

    public class AzureDocumentStorageService : IAzureDocumentStorageService
    {
        private readonly string _accountName;
        private readonly string _accountKey;
        private readonly string _containerName;
        private readonly ILogger<AzureDocumentStorageService> _logger;
        private readonly AzureDocumentManager _fileProvider;
        private readonly string _rootFolderName;

        public AzureDocumentStorageService(IConfiguration configuration, ILogger<AzureDocumentStorageService> logger)
        {

            _accountName = configuration["accountName"]
                ?? throw new InvalidOperationException("Missing configuration: accountName");

            _accountKey = configuration["accountKey"]
                ?? throw new InvalidOperationException("Missing configuration: accountKey");

            _containerName = configuration["containerName"]
                ?? throw new InvalidOperationException("Missing configuration: containerName");

            _logger = logger;

            // Folder name created inside the container
            _rootFolderName = "Files";

            _fileProvider = new AzureDocumentManager();

            var basePath = $"https://{_accountName}.blob.core.windows.net/{_containerName}/";
            var filePath = $"{basePath}{_rootFolderName}".TrimEnd('/', '\\');

            // Basic sanitization (optional)
            basePath = basePath.Replace("../", "");
            filePath = filePath.Replace("../", "");

            // Ensure basePath ends with exactly one trailing slash
            basePath = basePath.TrimEnd('/', '\\') + "/";

            // Ensure filePath has no trailing slash
            filePath = filePath.TrimEnd('/', '\\');

            // Configure provider
            _fileProvider.SetBlobContainer(basePath, filePath);

            _fileProvider.RegisterAzure(_accountName, _accountKey, _containerName);
        }

        public object ManageDocument(FileManagerDirectoryContent args)
        {
            try
            {
                if (args == null) throw new ArgumentNullException(nameof(args));

                // Null guards to avoid random NREs from client payload variations
                args.Path ??= "/";
                args.TargetPath ??= "/";
                args.Names ??= Array.Empty<string>();
                args.Data ??= Array.Empty<FileManagerDirectoryContent>();

                NormalizeDocumentPaths(ref args);

                return args.Action switch
                {
                    "read" => _fileProvider.ToCamelCase(_fileProvider.GetFiles(args.Path, args.ShowHiddenItems, args.Data)),
                    "delete" => _fileProvider.ToCamelCase(_fileProvider.Delete(args.Path, args.Names, args.Data)),
                    "details" => _fileProvider.ToCamelCase(_fileProvider.Details(args.Path, args.Names, args.Data)),
                    "search" => _fileProvider.ToCamelCase(_fileProvider.Search(args.Path, args.SearchString, args.ShowHiddenItems, args.CaseSensitive, args.Data)),
                    "copy" => _fileProvider.ToCamelCase(_fileProvider.Copy(args.Path, args.TargetPath, args.Names, args.RenameFiles, args.TargetData, args.Data)),

                    _ => _fileProvider.ToCamelCase(new FileManagerResponse
                    {
                        Error = new ErrorDetails
                        {
                            Code = "400",
                            Message = $"Unsupported action: {args.Action ?? "(null)"}"
                        }
                    })

                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "File operation failed");
                throw;
            }
        }

        private void NormalizeDocumentPaths(ref FileManagerDirectoryContent args)
        {
            if (args == null) return;

            args.Path ??= "/";
            args.TargetPath ??= "/";

            var basePath = $"https://{_accountName}.blob.core.windows.net/{_containerName}/";

            // originalPath becomes "Files"
            var originalPath = $"{basePath}{_rootFolderName}".Replace(basePath, "");

            // Normalize current path
            args.Path = args.Path.Contains(originalPath)
                ? args.Path.Replace("//", "/")
                : $"{originalPath}{args.Path}".Replace("//", "/");

            // Normalize target path (used by copy/move)
            args.TargetPath = $"{originalPath}{args.TargetPath}".Replace("//", "/");
        }
    }
}

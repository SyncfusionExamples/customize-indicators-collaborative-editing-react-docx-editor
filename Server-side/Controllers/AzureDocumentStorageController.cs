using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Syncfusion.EJ2.FileManager.Base;
using CollaborativeEditingServerSide.Service;

namespace CollaborativeEditingServerSide.Controllers
{
    /// <summary>
    /// Controller for handling Azure file operations and document management
    /// </summary>
    [Route("[controller]")]
    [EnableCors("AllowAllOrigins")]
    public class AzureDocumentStorageController : ControllerBase
    {
        private readonly IAzureDocumentStorageService _documentStorageService;

        /// <summary>
        /// Constructor injecting the file provider service dependency.
        /// </summary>
        /// <param name="documentStorageService">Service for performing file operations</param>
        public AzureDocumentStorageController(IAzureDocumentStorageService documentStorageService)
        {
            _documentStorageService = documentStorageService;
        }

        /// <summary>
        /// Handles file management operations (read, delete, copy, search)
        /// </summary>
        /// <param name="args">File operation parameters including path and action type</param>
        /// <returns>Result of the file operation</returns>
        [HttpPost("ManageDocument")]
        [EnableCors("AllowAllOrigins")]
        public object ManageDocument([FromBody] FileManagerDirectoryContent args)
        {
            return _documentStorageService.ManageDocument(args);
        }
    }
}
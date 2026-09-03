using CollaborativeEditingServerSide.Service;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;

namespace CollaborativeEditingServerSide.Controllers
{
    /// <summary>
    /// API controller that exposes the user directory. The static profile
    /// data (Name, Id, ProfileIcon) comes from <c>wwwroot/Data/users.json</c>
    /// and the <c>onlineStatus</c> field is computed from the live presence
    /// data in Redis.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly UserDirectoryService _directoryService;

        public UsersController(UserDirectoryService directoryService)
        {
            _directoryService = directoryService;
        }

        /// <summary>
        /// Returns the full list of users. Each user is decorated with a live
        /// <c>onlineStatus</c> ("Online" if the user is currently in any
        /// collaboration session, "Offline" otherwise).
        /// </summary>
        [HttpGet]
        [EnableCors("AllowAllOrigins")]
        public IActionResult GetUsers()
        {
            try
            {
                var users = _directoryService.GetUsers();
                return Ok(new { users });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to load users", details = ex.Message });
            }
        }

        /// <summary>
        /// Returns a single user by id, or <c>404</c> if not found.
        /// </summary>
        [HttpGet("{id}")]
        [EnableCors("AllowAllOrigins")]
        public IActionResult GetUserById(string id)
        {
            try
            {
                var directory = _directoryService.GetUsers();
                var user = directory.FirstOrDefault(u =>
                    string.Equals(u.Id, id, StringComparison.OrdinalIgnoreCase));

                if (user == null)
                {
                    return NotFound(new { error = $"User '{id}' not found." });
                }

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to load user", details = ex.Message });
            }
        }
    }
}

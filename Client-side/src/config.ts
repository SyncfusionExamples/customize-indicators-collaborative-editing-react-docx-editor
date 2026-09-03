/**
 * Central client configuration.
 *
 * The backend (ASP.NET Core collaborative editing server) base URL used by
 * the editor for: SignalR hub, collaborative editing APIs, user directory,
 * spell check, and avatar assets.
 *
 * Keep the trailing slash — API paths are concatenated directly:
 *   e.g. SERVICE_URL + 'api/CollaborativeEditing/ImportFile'
 */
export const SERVICE_URL = 'http://localhost:5212/';

import type { UserProfile } from './user-types';

/** Cached in-memory copy of the user directory. */
let userDirectoryCache: UserProfile[] | null = null;

/** Pending in-flight request, shared across concurrent callers. */
let pendingRequest: Promise<UserProfile[]> | null = null;

/**
 * Fetches the user directory from the server.
 * The result is cached in-memory for the lifetime of the page; subsequent
 * calls return the cached list immediately.
 */
export async function fetchUserDirectory(
  serviceUrl: string,
  options: { force?: boolean } = {}
): Promise<UserProfile[]> {
  if (!options.force && userDirectoryCache) {
    return userDirectoryCache;
  }
  if (pendingRequest && !options.force) {
    return pendingRequest;
  }

  pendingRequest = (async () => {
    const url = `${serviceUrl.replace(/\/$/, '')}/api/Users`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Failed to load users: ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { users?: UserProfile[] };
    const users = Array.isArray(payload?.users) ? payload.users : [];
    userDirectoryCache = users;
    return users;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

/**
 * Looks up a user profile by name. Returns the first match (case-insensitive),
 * or `null` if no match is found.
 */
export function findProfileByName(
  users: UserProfile[] | null | undefined,
  name: string
): UserProfile | null {
  if (!users || !name) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    users.find((u) => (u.name || '').trim().toLowerCase() === needle) ?? null
  );
}

/**
 * Looks up a user profile by id. Returns the profile or `null` if not found.
 */
export function findProfileById(
  users: UserProfile[] | null | undefined,
  id: string
): UserProfile | null {
  if (!users || !id) return null;
  return users.find((u) => (u.id || '').toLowerCase() === id.toLowerCase()) ?? null;
}

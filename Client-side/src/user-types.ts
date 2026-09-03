/**
 * Roles available in the user directory. Mirrors the `userRole` field in
 * `Server-side/wwwroot/Data/users.json`.
 */
export type UserRole = 'Owner' | 'Editor' | 'Reviewer' | 'Commenter' | 'Viewer' | string;

/**
 * The full set of roles in display order. Used to render role chips / badges
 * in a consistent order regardless of the order they appear in users.json.
 */
export const USER_ROLES: readonly UserRole[] = [
  'Owner',
  'Editor',
  'Reviewer',
  'Commenter',
  'Viewer',
] as const;

/**
 * Tailwind 3 default palette colors (one per role). Used by both the avatar
 * ring and the role chip so customers can restyle them by overriding CSS
 * variables on `.role-color-Owner`, etc.
 */
export const ROLE_COLORS: Readonly<Record<UserRole, string>> = {
  Owner:     '#f59e0b', // amber-500
  Editor:    '#3b82f6', // blue-500
  Reviewer:  '#22c55e', // green-500
  Commenter: '#a855f7', // purple-500
  Viewer:    '#64748b', // slate-500
};

/** Returns the mockup's Tailwind 3 palette color for a given role. */
export function roleColor(role: UserRole | undefined | null): string {
  if (!role) return ROLE_COLORS.Viewer;
  return ROLE_COLORS[role as UserRole] ?? ROLE_COLORS.Viewer;
}

/**
 * Shape of a single user record returned by `GET /api/Users`.
 * Source of truth: `Server-side/wwwroot/Data/users.json`.
 */
export interface UserProfile {
  /** Stable identifier for the user (e.g. "U001"). */
  id: string;
  /** Display name (e.g. "Andy Bernard"). */
  name: string;
  /** Two-letter initials rendered when no profile icon is available. */
  initials?: string;
  /**
   * Profile icon. Either an `http(s)` URL, a server-relative path beginning
   * with `/`, or a `data:image/...` URI.
   */
  profileIcon: string;
  /** One of "Online" or "Offline". */
  onlineStatus: 'Online' | 'Offline' | string;
  /** Role within the document. */
  userRole: UserRole;
  /** Free-form email used by the user-details pop-up. */
  email?: string;
  /** Free-form organization used by the user-details pop-up. */
  organization?: string;
}

/** A partial / sparse profile used when a remote peer has not sent a full profile. */
export type UserProfileLike = Partial<UserProfile> & { name: string };

/** The directory payload returned by the server. */
export interface UserDirectoryResponse {
  users: UserProfile[];
}

/**
 * Resolves the avatar URL for a profile. Relative paths (`/foo.svg`) are
 * resolved against the configured serviceUrl; data URIs and absolute URLs
 * are returned as-is.
 */
export function resolveAvatarUrl(
  profile: { profileIcon?: string | null },
  serviceUrl: string
): string {
  const icon = profile?.profileIcon;
  if (!icon) return '';
  if (icon.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(icon)) {
    return icon;
  }
  if (icon.startsWith('/')) {
    return serviceUrl.replace(/\/$/, '') + icon;
  }
  return serviceUrl.replace(/\/$/, '') + '/' + icon;
}

const DEFAULT_FORUM_ORIGIN = "https://bbs.example.com";
const DEFAULT_FORUM_PATH = "/";

function sanitizeOrigin(value?: string) {
  if (!value) return DEFAULT_FORUM_ORIGIN;

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return DEFAULT_FORUM_ORIGIN;
  }
}

function sanitizePath(value?: string) {
  if (!value) return DEFAULT_FORUM_PATH;

  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_FORUM_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function getForumOrigin() {
  return sanitizeOrigin(process.env.NEXT_PUBLIC_FORUM_ORIGIN);
}

export function getForumEntryPath() {
  return sanitizePath(process.env.NEXT_PUBLIC_FORUM_ENTRY_PATH);
}

export function getForumEntryUrl() {
  return `${getForumOrigin()}${getForumEntryPath()}`;
}

export function getDefaultPostLoginRedirect() {
  return getForumEntryUrl();
}

export function getNavbarForumHref() {
  return getForumEntryUrl();
}

export interface LoginResult {
  authenticated: boolean;
  token: string | null;
}

export interface UnlockResult {
  authorized: boolean;
  flag: string | null;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return payload;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store"
  });

  return parseJsonResponse<LoginResult>(response);
}

export async function unlock(token: string | null): Promise<UnlockResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch("/api/unlock", {
    method: "POST",
    headers,
    body: "{}",
    cache: "no-store"
  });

  return parseJsonResponse<UnlockResult>(response);
}

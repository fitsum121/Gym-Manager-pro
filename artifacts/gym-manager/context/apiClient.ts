import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "gym_session_v2";

// Base URL — set EXPO_PUBLIC_API_URL in your environment
// Falls back to localhost for local development
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "localhost:8080"}`;

export class ApiError extends Error {
  constructor(
    public status: number | null,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Read token from session storage
  let token: string | null = null;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      token = session?.token ?? null;
    }
  } catch {
    // Ignore storage errors — proceed without token
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(null, "Could not connect to server. Check your internet connection and try again.");
  }

  // Handle 401 — token expired, invalid, or account deleted
  if (response.status === 401) {
    // Parse the body first to get the server's specific error message
    let message = "Session expired. Please sign in again.";
    try {
      const body = await response.json() as Record<string, unknown>;
      if (body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // ignore parse error, use default message
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    throw new ApiError(401, message);
  }

  // Parse response body
  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = null;
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string")
        ? (body as Record<string, string>).error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return body as T;
}

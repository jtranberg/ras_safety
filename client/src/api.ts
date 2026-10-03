export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FRAMER";
};

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.message || "Request failed.",
      response.status
    );
  }

  return data as T;
}
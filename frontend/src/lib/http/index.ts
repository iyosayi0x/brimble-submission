import CONFIGS from "../config";

/**
 * define custom error for better debugging
 */
export class FetchError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.data = data;
  }
}

export default async function fetchClient<T>(
  url: string,
  init?: RequestInit & { data?: Record<string, string | number | boolean> },
): Promise<T> {
  /**
   * url cleaning
   */
  const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
  const fullUrl = `${CONFIGS.BASE_URL}/${cleanUrl}`;

  /**
   * specify default headers
   */
  const headers = new Headers({
    "Content-Type": "application/json",
    ...init?.headers,
  });

  /**
   * request body — destructure data out so it is not passed to fetch
   */
  const { data, ...restInit } = (init ?? {}) as RequestInit & {
    data?: Record<string, string | number | boolean>;
  };
  const body = data ? JSON.stringify(data) : undefined;

  /**
   * make request
   */
  const response = await fetch(fullUrl, {
    ...restInit,
    credentials: "include",
    headers,
    body,
  });

  /**
   * handle non 2xx response
   */
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    throw new FetchError(
      response.status,
      `Request failed: ${response.status}`,
      errorData,
    );
  }

  /**
   * handle 204 response
   */
  if (response.status === 204) {
    return {} as T;
  }

  /**
   * return data
   */
  return response.json();
}

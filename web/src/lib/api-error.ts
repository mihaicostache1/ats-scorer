/**
 * Turns whatever an API call returned into messages a person can act on.
 *
 * The real API answers with FastAPI's `{ detail }` (a string, or a list of field errors on 422);
 * the OpenAPI contract's other endpoints use `{ error: { message } }`. Both are handled.
 */

export interface ApiFailure {
  /** One sentence for the form banner. */
  message: string;
  /** Per-field messages, keyed by the API's field name (422 only). */
  fields: Record<string, string>;
}

type Unknown = Record<string, unknown>;

const isObject = (v: unknown): v is Unknown => typeof v === "object" && v !== null;

/** pydantic messages arrive as "Value error, Password is too common" — drop the prefix. */
const cleanMessage = (msg: string) => msg.replace(/^Value error,\s*/i, "");

export function parseApiFailure(error: unknown, status?: number): ApiFailure {
  const fields: Record<string, string> = {};

  if (status === 429) {
    return { message: "Too many attempts. Please wait a minute and try again.", fields };
  }
  if (status !== undefined && status >= 500) {
    return { message: "The server ran into a problem. Please try again shortly.", fields };
  }

  if (isObject(error)) {
    const detail = error.detail;
    if (typeof detail === "string") return { message: detail, fields };

    if (Array.isArray(detail)) {
      for (const item of detail) {
        if (!isObject(item) || typeof item.msg !== "string") continue;
        const loc = Array.isArray(item.loc) ? item.loc : [];
        const field = String(loc[loc.length - 1] ?? "");
        if (field && !(field in fields)) fields[field] = cleanMessage(item.msg);
      }
      return { message: "Please fix the highlighted fields.", fields };
    }

    const envelope = error.error;
    if (isObject(envelope) && typeof envelope.message === "string") {
      return { message: envelope.message, fields };
    }
  }

  return { message: "Something went wrong. Please try again.", fields };
}

/** A thrown fetch (offline, API down, CORS) never reaches the `{ error }` branch. */
export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";

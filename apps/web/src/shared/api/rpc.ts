import { ErrorCode, createProtocolError, type ProtocolError } from "@omioroom/contracts";
import { supabase } from "./supabase.js";

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

function protocolError(code: string, retryable = false): ProtocolError {
  return createProtocolError(
    (KNOWN_CODES.has(code) ? code : ErrorCode.INTERNAL_ERROR) as ErrorCode,
    code,
    retryable
  );
}

/**
 * Calls a database function. Failures surface as ProtocolError with a stable code:
 * the SQL side raises plain codes ('ROOM_FULL') or returns {error: CODE} (see migration).
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch {
    throw protocolError(ErrorCode.INTERNAL_ERROR, true);
  }

  const { data, error } = result;
  if (error) {
    const message = error.message ?? "";
    if (KNOWN_CODES.has(message)) throw protocolError(message, message === ErrorCode.RATE_LIMITED);
    // JWT/auth problems and network failures are not business errors
    const retryable = !error.code || error.code.startsWith("PGRST3") === false;
    throw protocolError(ErrorCode.INTERNAL_ERROR, retryable);
  }

  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as { error?: unknown }).error === "string") {
    const code = (data as { error: string }).error;
    throw protocolError(code, code === ErrorCode.RATE_LIMITED);
  }
  return data as T;
}

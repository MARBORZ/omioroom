import { ErrorCode, createProtocolError, type ProtocolError } from "@omioroom/contracts";

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

/**
 * Translates a service-layer error into a stable protocol error.
 * Unknown errors are logged server-side and returned as a generic INTERNAL_ERROR
 * so that internal details never reach the client.
 */
export function toProtocolError(err: unknown, context: string): ProtocolError {
  const message = err instanceof Error ? err.message : "";
  if (KNOWN_CODES.has(message)) {
    const code = message as ErrorCode;
    return createProtocolError(code, code, code === ErrorCode.RATE_LIMITED);
  }
  console.error(`[${context}] unexpected error:`, message || err);
  return createProtocolError(ErrorCode.INTERNAL_ERROR, "Internal server error", true);
}

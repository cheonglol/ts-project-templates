import { validate as uuidValidate } from "uuid";

/**
 * Validates if the given string is a valid UUID.
 * Uses the uuid library, but falls back to regex for extra strictness.
 * @param userUuid - The UUID string to validate.
 * @returns True if valid, false otherwise.
 */
export function validateUserUuid(userUuid: string): boolean {
  // Use uuidValidate, but also check with regex for stricter validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidValidate(userUuid) && uuidRegex.test(userUuid);
}

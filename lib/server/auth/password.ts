import { compare, hash } from "bcryptjs";
import { DomainError } from "@/lib/server/platform/domain-error";

const PASSWORD_ROUNDS = 12;
export const MINIMUM_PASSWORD_LENGTH = 12;
export const MAXIMUM_PASSWORD_LENGTH = 72;

export function validatePasswordLength(password: string) {
  if (
    password.length < MINIMUM_PASSWORD_LENGTH ||
    password.length > MAXIMUM_PASSWORD_LENGTH
  ) {
    throw new DomainError(
      422,
      `Password must contain ${MINIMUM_PASSWORD_LENGTH} to ${MAXIMUM_PASSWORD_LENGTH} characters.`,
      "INVALID_PASSWORD_LENGTH",
    );
  }
}

export async function hashPassword(password: string) {
  validatePasswordLength(password);
  return hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

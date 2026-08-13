import assert from "node:assert/strict";
import test from "node:test";
import { plusDays, today } from "../lib/client/date-utils";
import {
  hashPassword,
  validatePasswordLength,
  verifyPassword,
} from "../lib/server/auth/password";
import {
  ABSOLUTE_SESSION_SECONDS,
  computeSlidingExpiry,
  IDLE_TIMEOUT_SECONDS,
  SESSION_COOKIE_NAME,
  sessionTokenFromCookieHeader,
  sessionTokenHash,
} from "../lib/server/auth/session-service";

test("passwords are hashed and verified without storing plaintext", async () => {
  const password = "Correct-Horse-2026";
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("Wrong-Password-2026", passwordHash), false);
});

test("short passwords are rejected", () => {
  assert.throws(
    () => validatePasswordLength("too-short"),
    /12 to 72 characters/,
  );
});

test("the session cookie parser selects only the ERP cookie", () => {
  const token = "private-session-token";
  const cookieHeader = `theme=dark; ${SESSION_COOKIE_NAME}=${token}; locale=en-PK`;

  assert.equal(sessionTokenFromCookieHeader(cookieHeader), token);
  assert.equal(sessionTokenFromCookieHeader("theme=dark"), null);
});

test("session tokens are represented by one-way hashes in the database", () => {
  const token = "private-session-token";
  assert.equal(sessionTokenHash(token), sessionTokenHash(token));
  assert.notEqual(sessionTokenHash(token), token);
  assert.notEqual(sessionTokenHash(token), sessionTokenHash(`${token}-other`));
});

test("a session well inside the absolute window slides forward on use", () => {
  const createdAt = new Date("2026-08-12T09:00:00.000Z");
  const now = new Date("2026-08-12T09:05:00.000Z");
  const currentExpiresAt = new Date(now.getTime() - 60_000);

  const { nextExpiresAt, shouldPersist } = computeSlidingExpiry({
    now,
    createdAt,
    currentExpiresAt,
  });

  assert.equal(nextExpiresAt.getTime(), now.getTime() + IDLE_TIMEOUT_SECONDS * 1000);
  assert.equal(shouldPersist, true);
});

test("the sliding extension is capped at the absolute session ceiling", () => {
  const createdAt = new Date("2026-08-12T09:00:00.000Z");
  const absoluteExpiry = new Date(createdAt.getTime() + ABSOLUTE_SESSION_SECONDS * 1000);
  // Close enough to the ceiling that now + IDLE_TIMEOUT_SECONDS would overshoot it.
  const now = new Date(absoluteExpiry.getTime() - 60_000);
  // Comfortably old enough that the capped extension still clears the
  // write-persist threshold, isolating "is it capped" from "is it persisted".
  const currentExpiresAt = new Date(now.getTime() - 10 * 60_000);

  const { nextExpiresAt, shouldPersist } = computeSlidingExpiry({
    now,
    createdAt,
    currentExpiresAt,
  });

  assert.equal(nextExpiresAt.getTime(), absoluteExpiry.getTime());
  assert.equal(shouldPersist, true);
});

test("a second call moments later does not re-persist a negligible extension", () => {
  const createdAt = new Date("2026-08-12T09:00:00.000Z");
  const now = new Date("2026-08-12T09:05:00.000Z");
  // Already extended almost to where this call would extend it to.
  const currentExpiresAt = new Date(
    now.getTime() + IDLE_TIMEOUT_SECONDS * 1000 - 10_000,
  );

  const { shouldPersist } = computeSlidingExpiry({ now, createdAt, currentExpiresAt });

  assert.equal(shouldPersist, false);
});

test("the sliding expiry is monotonic — it never moves backward", () => {
  const createdAt = new Date("2026-08-12T09:00:00.000Z");
  let currentExpiresAt = new Date(createdAt.getTime() + IDLE_TIMEOUT_SECONDS * 1000);

  for (const minutesElapsed of [1, 6, 12, 20, 45, 90]) {
    const now = new Date(createdAt.getTime() + minutesElapsed * 60_000);
    const { nextExpiresAt } = computeSlidingExpiry({ now, createdAt, currentExpiresAt });
    assert.ok(nextExpiresAt.getTime() >= currentExpiresAt.getTime());
    currentExpiresAt = nextExpiresAt;
  }
});

test("business dates use Pakistan time regardless of host timezone", () => {
  const nearMidnightUtc = new Date("2026-07-29T20:00:00.000Z");
  assert.equal(today(nearMidnightUtc), "2026-07-30");
  assert.equal(
    plusDays(1, new Date("2026-01-31T12:00:00.000Z")),
    "2026-02-01",
  );
});

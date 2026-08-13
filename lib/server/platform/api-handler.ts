import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { requireRequestActor } from "@/lib/server/auth/session-service";
import { DomainError } from "./domain-error";
import { logger } from "./logger";

export { requireRequestActor };

type ErrorBody = { error: string; code: string; issues?: unknown };

function endpointOf(request: Request) {
  try {
    return { method: request.method, path: new URL(request.url).pathname };
  } catch {
    return { method: request.method, path: "unknown" };
  }
}

/**
 * Maps an expected failure to a client response, or returns null when the
 * error is not one we recognise — in which case it is a genuine fault and the
 * caller turns it into a logged 500.
 */
function expectedFailure(error: unknown): { status: number; body: ErrorBody } | null {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: error.issues[0]?.message ?? "Invalid request data.",
        code: "VALIDATION_ERROR",
        issues: error.issues,
      },
    };
  }

  if (error instanceof DomainError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          status: 409,
          body: { error: "A record with the same unique value already exists.", code: "DUPLICATE_RECORD" },
        };
      case "P2003":
        return {
          status: 409,
          body: { error: "This record is still referenced by other business data.", code: "RECORD_IN_USE" },
        };
      case "P2025":
        return { status: 404, body: { error: "The requested record was not found.", code: "NOT_FOUND" } };
      case "P2034":
        return {
          status: 409,
          body: { error: "The transaction conflicted with another update. Please retry.", code: "WRITE_CONFLICT" },
        };
    }
  }

  return null;
}

/**
 * The single error boundary for every API route.
 *
 * Anything not explicitly recognised is a bug, not a validation failure: it is
 * logged with its stack and answered with a generic 500. Previously the
 * fallback returned the raw `Error.message` to the client with status 422, so
 * no request ever produced a 500, genuine faults were indistinguishable from
 * bad input, and internal detail — Prisma's message text includes table names
 * and server file paths — was rendered in the browser.
 */
export async function apiHandler(
  request: Request,
  work: () => Promise<Response>,
): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    const endpoint = endpointOf(request);
    const expected = expectedFailure(error);

    if (expected) {
      // Authorisation failures are worth seeing; ordinary validation noise is not.
      if (expected.status === 401 || expected.status === 403) {
        logger.warn("request rejected", { ...endpoint, status: expected.status, code: expected.body.code });
      } else {
        logger.debug("request rejected", { ...endpoint, status: expected.status, code: expected.body.code });
      }
      return Response.json(expected.body, { status: expected.status });
    }

    logger.error("unhandled request failure", error, { ...endpoint, status: 500 });
    return Response.json(
      { error: "Something went wrong on our side. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

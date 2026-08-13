export class DomainError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "DOMAIN_ERROR",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertDomain(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new DomainError(status, message, code);
}

/** Commands return `{ code, message }`; older paths may still throw plain strings. */
export type CommandError = {
  code?: string;
  message?: string;
};

export function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as CommandError).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as CommandError).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return String(error);
}

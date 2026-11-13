/** A short, plain reason for a classifier failure, from the error string classify() stores ("rate_limit: …", "timeout: …"). */
export function classifierFailure(error: string): string {
  const kind = error.split(":")[0];
  switch (kind) {
    case "rate_limit":
      return "rate limit";
    case "timeout":
      return "timeout";
    case "network":
      return "network problem";
    case "invalid_output":
    case "empty":
      return "unusable answer";
    case "http":
      return "provider error";
    default:
      return "error";
  }
}

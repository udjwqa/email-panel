export interface FormatResult {
  valid: boolean;
  reason?: string;
}

const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

export function validateFormat(email: string): FormatResult {
  if (!email || email.length > 254) {
    return { valid: false, reason: "Email too long or empty" };
  }

  const [local, domain] = email.split("@");

  if (!local || !domain) {
    return { valid: false, reason: "Missing local part or domain" };
  }

  if (local.length > 64) {
    return { valid: false, reason: "Local part exceeds 64 characters" };
  }

  if (local.includes("..")) {
    return { valid: false, reason: "Double dots in local part" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: "Invalid email format" };
  }

  return { valid: true };
}

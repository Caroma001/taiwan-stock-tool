const COOKIE_NAME = "twstock_auth";
const SESSION_VERSION = "v1";

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(password: string, secret: string): Promise<string> {
  const payload = `${SESSION_VERSION}:${password}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${SESSION_VERSION}.${bytesToHex(signature)}`;
}

export async function isValidSessionToken(token: string | undefined, password: string, secret: string): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken(password, secret);
  if (token.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < token.length; index += 1) {
    difference |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export { COOKIE_NAME };

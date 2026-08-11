export type LoginMode =
  | "sign-in"
  | "create-account";

export function loginModeFromParam(
  value: string | string[] | undefined,
): LoginMode {
  const scalar = Array.isArray(value)
    ? value[0]
    : value;

  return scalar === "create-account"
    ? "create-account"
    : "sign-in";
}

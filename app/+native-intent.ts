import {
  rewriteIncomingCanalAuthPath,
} from "../lib/auth-redirect";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  return rewriteIncomingCanalAuthPath(
    path,
  );
}

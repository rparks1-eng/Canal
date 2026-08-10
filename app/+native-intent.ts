import {
  rewriteIncomingCanalAuthPath,
} from "../lib/auth-redirect";

import {
  parsePublicDestination,
} from "../lib/public-linking";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  const destination =
    parsePublicDestination(path);

  if (destination) {
    return destination;
  }

  return rewriteIncomingCanalAuthPath(
    path,
  );
}

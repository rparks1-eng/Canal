import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

function source(
  path: string,
): string {
  return readFileSync(
    resolve(
      __dirname,
      "..",
      path,
    ),
    "utf8",
  );
}

const SETTINGS =
  source(
    "app/settings-preferences.tsx",
  );
const SCREEN =
  source(
    "app/delete-account.tsx",
  );
const CLIENT =
  source(
    "lib/account-deletion.ts",
  );
const FUNCTION =
  source(
    "supabase/functions/delete-account/index.ts",
  );

describe(
  "permanent Canal account deletion",
  () => {
    it(
      "starts from Settings and requires typed plus native confirmation",
      () => {
        expect(
          SETTINGS,
        ).toContain(
          'label="Permanently delete account" onPress={() => router.push("/delete-account")}',
        );
        expect(
          SCREEN,
        ).toContain(
          'accessibilityLabel="Account deletion confirmation"',
        );
        expect(
          SCREEN,
        ).toMatch(
          /confirmationMatches[\s\S]*Alert[.]alert[\s\S]*Delete Forever/u,
        );
        expect(
          SCREEN,
        ).toMatch(
          /Platform[.]OS === "web"[\s\S]*confirm[\s\S]*permanentlyDelete/u,
        );
        expect(
          SCREEN,
        ).toMatch(
          /deleteCanalAccount[\s\S]*clearLocalAccountAfterDeletion[\s\S]*pathname: "\/login"/u,
        );
      },
    );

    it(
      "keeps privileged Auth deletion on the server",
      () => {
        expect(
          CLIENT,
        ).toContain(
          'supabase.functions.invoke<DeleteAccountResponse>',
        );
        expect(
          CLIENT,
        ).not.toContain(
          "auth.admin.deleteUser",
        );
        expect(
          FUNCTION,
        ).toMatch(
          /userClient[.]auth[.]getUser[(][)][\s\S]*expectedUserId !==[\s\S]*user[.]id/u,
        );
        expect(
          FUNCTION,
        ).toContain(
          '"SUPABASE_SERVICE_ROLE_KEY"',
        );
      },
    );

    it(
      "removes owned media and non-cascading records before a hard Auth deletion",
      () => {
        const storageIndex =
          FUNCTION.indexOf(
            "removeOwnedStorageObjects(",
          );
        const authDeleteIndex =
          FUNCTION.indexOf(
            "auth.admin.deleteUser(",
          );

        expect(
          storageIndex,
        ).toBeGreaterThan(
          -1,
        );
        expect(
          authDeleteIndex,
        ).toBeGreaterThan(
          storageIndex,
        );
        expect(
          FUNCTION,
        ).toContain(
          '"profile-avatars"',
        );
        expect(
          FUNCTION,
        ).toContain(
          '"snapshot-media"',
        );
        expect(
          FUNCTION,
        ).toMatch(
          /deleteUser[(][\s\S]*user[.]id,[\s\S]*false/u,
        );
      },
    );

    it(
      "distinguishes server deletion failures from offline transport failures",
      () => {
        expect(
          CLIENT,
        ).toContain(
          'payload?.code === "ACCOUNT_DELETE_FAILED"',
        );
        expect(
          CLIENT,
        ).toContain(
          "Canal reached the account service",
        );
        expect(
          CLIENT,
        ).toContain(
          "Check your connection and retry",
        );
        expect(
          CLIENT,
        ).not.toContain(
          "try again when you are online",
        );
      },
    );
  },
);

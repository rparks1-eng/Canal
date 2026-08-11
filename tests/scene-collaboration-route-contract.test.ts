import fs from "node:fs";
import path from "node:path";

function source(
  filePath: string,
): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      filePath,
    ),
    "utf8",
  );
}

describe(
  "Scene collaboration route contract",
  () => {
    const layout =
      source(
        "app/_layout.tsx",
      );

    const activity =
      source(
        "components/activity-screen.tsx",
      );

    const detail =
      source(
        "app/scenes/[sceneId].tsx",
      );

    const collaboration =
      source(
        "app/scene-collaboration.tsx",
      );

    it(
      "registers a discoverable collaboration route",
      () => {
        expect(
          layout,
        ).toMatch(
          /Stack[.]Screen[\s\S]*name="scene-collaboration"/,
        );

        expect(
          activity,
        ).toMatch(
          /accessibilityLabel="Open Scene collaboration"[\s\S]*router[.]push[\s\S]*["/]scene-collaboration/,
        );
      },
    );

    it(
      "exposes invitation management only from owned Scene detail",
      () => {
        expect(
          detail,
        ).toMatch(
          /scene[.]libraryType ===[\s\S]*"created"[\s\S]*user[?][.]id[\s\S]*accessibilityLabel="Manage Scene collaboration"/,
        );

        expect(
          detail,
        ).toMatch(
          /ownerId:[\s\S]*user[.]id[\s\S]*sceneId:[\s\S]*scene[.]id/,
        );
      },
    );

    it(
      "supports invite, accept, decline, revoke, and revision-conflict recovery",
      () => {
        for (
          const functionName of
            [
              "inviteSceneCollaborator",
              "listIncomingSceneCollaborations",
              "respondToSceneCollaboration",
              "revokeSceneCollaborator",
              "saveCollaborativeScene",
            ]
        ) {
          expect(
            collaboration,
          ).toContain(
            functionName,
          );
        }

        expect(
          collaboration,
        ).toMatch(
          /isSceneRevisionConflictError[\s\S]*Reload latest/,
        );

        expect(
          collaboration,
        ).toMatch(
          /Invited edits use revision checks so newer work is never silently overwritten/,
        );
      },
    );
  },
);

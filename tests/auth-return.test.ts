import {
  mockStorage,
} from "./helpers/async-storage-mock";

import {
  consumePublicSceneReturn,
  rememberPublicSceneReturn,
} from "../lib/auth-return";

describe(
  "authenticated route return",
  () => {
    afterEach(async () => {
      await consumePublicSceneReturn();
      mockStorage.clear();
    });

    it(
      "retains one public Scene destination through authentication",
      async () => {
        await rememberPublicSceneReturn(
          "owner-1",
          "scene-1",
        );

        expect(
          await consumePublicSceneReturn(),
        ).toEqual({
          pathname:
            "/public-scene",
          params: {
            ownerId:
              "owner-1",
            sceneId:
              "scene-1",
          },
        });

        expect(
          await consumePublicSceneReturn(),
        ).toBeNull();
      },
    );

    it(
      "rejects unsafe lookup keys",
      async () => {
        await rememberPublicSceneReturn(
          "owner-1",
          "scene\n1",
        );

        expect(
          await consumePublicSceneReturn(),
        ).toBeNull();
      },
    );

    it(
      "persists the destination outside module memory",
      async () => {
        await rememberPublicSceneReturn(
          "owner-restart",
          "scene-restart",
        );

        expect(
          mockStorage.size,
        ).toBe(
          1,
        );

        expect(
          await consumePublicSceneReturn(),
        ).toMatchObject({
          params: {
            ownerId:
              "owner-restart",
            sceneId:
              "scene-restart",
          },
        });
      },
    );
  },
);

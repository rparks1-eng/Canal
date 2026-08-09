import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  readSnapshotMediaUploadBody,
} from "../lib/snapshot-cloud";

const mockFiles =
  new Map<
    string,
    Uint8Array
  >();

jest.mock(
  "expo-file-system",
  () => ({
    File: class MockFile {
      readonly uri: string;

      constructor(uri: string) {
        this.uri = uri;
      }

      get exists() {
        return mockFiles.has(
          this.uri,
        );
      }

      get size() {
        return mockFiles.get(
          this.uri,
        )?.byteLength ?? 0;
      }

      async arrayBuffer(): Promise<ArrayBuffer> {
        const bytes =
          mockFiles.get(
            this.uri,
          ) ?? new Uint8Array();

        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset +
            bytes.byteLength,
        ) as ArrayBuffer;
      }
    },
  }),
);

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {},
  }),
);

describe(
  "Snapshot media upload body",
  () => {
    beforeEach(() => {
      mockFiles.clear();
      jest.restoreAllMocks();
    });

    it(
      "reads native capture bytes instead of creating a zero-byte blob",
      async () => {
        const bytes =
          new Uint8Array([
            0,
            1,
            2,
            3,
          ]);

        mockFiles.set(
          "file:///capture.mov",
          bytes,
        );

        const uploadBody =
          await readSnapshotMediaUploadBody(
            "file:///capture.mov",
          );

        expect(
          Array.from(
            new Uint8Array(
              uploadBody,
            ),
          ),
        ).toEqual([
          0,
          1,
          2,
          3,
        ]);
      },
    );

    it(
      "rejects missing and empty native captures before Storage upload",
      async () => {
        await expect(
          readSnapshotMediaUploadBody(
            "file:///missing.jpg",
          ),
        ).rejects.toThrow(
          "no longer available",
        );

        mockFiles.set(
          "file:///empty.mov",
          new Uint8Array(),
        );

        await expect(
          readSnapshotMediaUploadBody(
            "file:///empty.mov",
          ),
        ).rejects.toThrow(
          "media is empty",
        );
      },
    );

    it(
      "rejects media larger than the bounded Snapshot limit",
      async () => {
        mockFiles.set(
          "file:///large.mov",
          new Uint8Array(
            100 * 1024 * 1024 +
              1,
          ),
        );

        await expect(
          readSnapshotMediaUploadBody(
            "file:///large.mov",
          ),
        ).rejects.toThrow(
          "100 MB or smaller",
        );
      },
    );
  },
);

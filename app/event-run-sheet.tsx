import {
  Redirect,
  useLocalSearchParams,
} from "expo-router";

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(
    value,
  )
    ? value[0] ??
        ""
    : value ??
        "";
}

export default function LegacyEventRunSheetRedirect() {
  const params =
    useLocalSearchParams<{
      collectionId?:
        | string
        | string[];
      sheetId?:
        | string
        | string[];
    }>();

  const collectionId =
    firstParam(
      params.collectionId,
    );

  const runSheetId =
    firstParam(
      params.sheetId,
    );

  if (runSheetId) {
    return (
      <Redirect
        href={{
          pathname:
            "/event-run-sheets/[runSheetId]",
          params: {
            runSheetId,
          },
        } as never}
      />
    );
  }

  if (collectionId) {
    return (
      <Redirect
        href={{
          pathname:
            "/event-run-sheets/new",
          params: {
            collectionId,
          },
        } as never}
      />
    );
  }

  return (
    <Redirect
      href={
        "/event-run-sheets" as never
      }
    />
  );
}

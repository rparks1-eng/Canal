import {
  createClient,
} from "npm:@supabase/supabase-js@2.110.9";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Access-Control-Allow-Origin":
    "*",
};

function json(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    },
  );
}

function requiredEnvironment(
  name: string,
): string {
  const value =
    Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(
      `Missing ${name}`,
    );
  }

  return value;
}

async function removeOwnedStorageObjects(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const {
    data: buckets,
    error: bucketError,
  } = await serviceClient.storage.listBuckets();

  if (bucketError) {
    throw bucketError;
  }

  const ownedBucketIds = new Set([
    "profile-avatars",
    "snapshot-media",
  ]);

  for (const bucket of buckets) {
    if (!ownedBucketIds.has(bucket.id)) {
      continue;
    }

    const paths: string[] = [];
    let offset = 0;

    while (true) {
      const {
        data,
        error,
      } = await serviceClient.storage
        .from(bucket.id)
        .list(userId, {
          limit: 100,
          offset,
          sortBy: {
            column: "name",
            order: "asc",
          },
        });

      if (error) {
        throw error;
      }

      for (const item of data) {
        if (item.id) {
          paths.push(
            `${userId}/${item.name}`,
          );
        }
      }

      if (paths.length > 2000) {
        throw new Error(
          "Account owns too many media objects for automatic deletion.",
        );
      }

      if (data.length < 100) {
        break;
      }

      offset += data.length;
    }

    for (
      let index = 0;
      index < paths.length;
      index += 100
    ) {
      const {
        error,
      } = await serviceClient.storage
        .from(bucket.id)
        .remove(
          paths.slice(
            index,
            index + 100,
          ),
        );

      if (error) {
        throw error;
      }
    }
  }
}

Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        },
      );
    }

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed",
        },
        405,
      );
    }

    try {
      const authorization =
        request.headers.get(
          "Authorization",
        );

      if (
        !authorization?.startsWith(
          "Bearer ",
        )
      ) {
        return json(
          {
            error:
              "Authentication required",
          },
          401,
        );
      }

      const supabaseUrl =
        requiredEnvironment(
          "SUPABASE_URL",
        );
      const publishableKey =
        requiredEnvironment(
          "SUPABASE_ANON_KEY",
        );
      const serviceRoleKey =
        requiredEnvironment(
          "SUPABASE_SERVICE_ROLE_KEY",
        );
      const userClient =
        createClient(
          supabaseUrl,
          publishableKey,
          {
            global: {
              headers: {
                Authorization:
                  authorization,
              },
            },
            auth: {
              autoRefreshToken:
                false,
              persistSession:
                false,
            },
          },
        );
      const {
        data: {
          user,
        },
        error: userError,
      } = await userClient.auth.getUser();

      if (
        userError ||
        !user
      ) {
        return json(
          {
            error:
              "Authentication required",
          },
          401,
        );
      }

      const body =
        await request.json() as {
          expectedUserId?: unknown;
          confirmation?: unknown;
        };
      const expectedUserId =
        typeof body.expectedUserId ===
        "string"
          ? body.expectedUserId.trim()
          : "";
      const confirmation =
        typeof body.confirmation ===
        "string"
          ? body.confirmation
              .trim()
              .toLowerCase()
          : "";
      const requiredConfirmation =
        user.email
          ?.trim()
          .toLowerCase() ||
        "delete";

      if (
        expectedUserId !==
          user.id ||
        confirmation !==
          requiredConfirmation
      ) {
        return json(
          {
            error:
              "Confirmation did not match the authenticated account",
          },
          400,
        );
      }

      const serviceClient =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              autoRefreshToken:
                false,
              persistSession:
                false,
            },
          },
        );

      await removeOwnedStorageObjects(
        serviceClient,
        user.id,
      );

      const {
        error: deleteError,
      } = await serviceClient.auth.admin.deleteUser(
        user.id,
        false,
      );

      if (deleteError) {
        throw deleteError;
      }

      return json(
        {
          deleted: true,
        },
        200,
      );
    } catch (error) {
      console.error(
        "delete-account failed",
        error instanceof Error
          ? error.message
          : "unknown error",
      );
      return json(
        {
          error: "Account deletion failed",
          code: "ACCOUNT_DELETE_FAILED",
        },
        500,
      );
    }
  },
);

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  StatusBar,
} from "expo-status-bar";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  OnboardingAtmosphere,
  OnboardingButton,
  OnboardingHeader,
  OnboardingPanel,
  useOnboardingPalette,
} from "../components/auth-onboarding-ui";

import {
  signInWithEmail,
  signInWithSocial,
  signUpWithEmail,
} from "../lib/canal-auth";

import {
  readPublicSceneReturn,
} from "../lib/auth-return";

import {
  isOnboardingRequired,
  markOnboardingRequired,
  ONBOARDING_METADATA_KEY,
  rememberPendingSignup,
} from "../lib/onboarding";

import {
  readCanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

import type {
  CanalSocialAuthProviderAvailability,
} from "../lib/social-auth-providers";

import {
  useAuth,
} from "../providers/auth-provider";

type LoginMode =
  | "sign-in"
  | "create-account";

type FieldErrors = {
  displayName?: string;
  handle?: string;
  email?: string;
  password?: string;
};

async function continueAfterAccountLogin(
  session: Session,
): Promise<void> {
  await isOnboardingRequired(
    session.user.id,
    session.user.email,
    session.user.created_at,
    session.user.user_metadata?.[
      ONBOARDING_METADATA_KEY
    ],
  );
}

function isFirstSocialSignIn(
  session: Session,
): boolean {
  const createdAt =
    Date.parse(
      session.user.created_at,
    );
  const lastSignInAt =
    Date.parse(
      session.user.last_sign_in_at ??
        "",
    );

  return (
    Number.isFinite(
      createdAt,
    ) &&
    Number.isFinite(
      lastSignInAt,
    ) &&
    Math.abs(
      lastSignInAt -
        createdAt,
    ) < 120_000
  );
}

function validateFields(
  input: {
    mode: LoginMode;
    displayName: string;
    handle: string;
    email: string;
    password: string;
  },
): FieldErrors {
  const errors: FieldErrors =
    {};

  if (
    input.mode ===
      "create-account" &&
    input.displayName.trim()
      .length < 2
  ) {
    errors.displayName =
      "Enter the name people will see in Canal.";
  }

  if (
    input.mode ===
      "create-account" &&
    !/^@?[a-zA-Z0-9_]{3,24}$/u.test(
      input.handle.trim(),
    )
  ) {
    errors.handle =
      "Use 3–24 letters, numbers, or underscores.";
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      input.email.trim(),
    )
  ) {
    errors.email =
      "Enter a valid email address.";
  }

  if (
    input.password.length < 8
  ) {
    errors.password =
      "Use at least 8 characters.";
  }

  return errors;
}

export default function LoginScreen() {
  const params =
    useLocalSearchParams<{
      mode?: string;
      deleted?: string;
    }>();
  const {
    width,
  } =
    useWindowDimensions();
  const colorScheme =
    useColorScheme();
  const {
    configured,
  } =
    useAuth();
  const colors =
    useOnboardingPalette(
      "violet",
    );
  const [
    mode,
    setMode,
  ] = useState<LoginMode>(
    params.mode ===
      "create-account"
      ? "create-account"
      : "sign-in",
  );
  const [
    displayName,
    setDisplayName,
  ] = useState("");
  const [
    handle,
    setHandle,
  ] = useState("");
  const [
    email,
    setEmail,
  ] = useState("");
  const [
    password,
    setPassword,
  ] = useState("");
  const [
    showPassword,
    setShowPassword,
  ] = useState(false);
  const [
    loading,
    setLoading,
  ] = useState(false);
  const [
    message,
    setMessage,
  ] = useState("");
  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");
  const [
    fieldErrors,
    setFieldErrors,
  ] = useState<FieldErrors>(
    {},
  );
  const [
    hasSharedSceneReturn,
    setHasSharedSceneReturn,
  ] = useState(false);
  const [
    socialAvailability,
    setSocialAvailability,
  ] = useState<CanalSocialAuthProviderAvailability | null>(
    null,
  );
  const authInFlightRef =
    useRef(false);

  const isWide =
    width >= 760;

  useEffect(() => {
    let active =
      true;

    readPublicSceneReturn()
      .then(
        (destination) => {
          if (active) {
            setHasSharedSceneReturn(
              Boolean(
                destination,
              ),
            );
          }
        },
      )
      .catch(() => {
        if (active) {
          setHasSharedSceneReturn(
            false,
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active =
      true;

    if (!configured) {
      setSocialAvailability({
        google: false,
        apple: false,
      });

      return () => {
        active = false;
      };
    }

    setSocialAvailability(
      null,
    );
    readCanalSocialAuthProviderAvailability()
      .then(
        (availability) => {
          if (active) {
            setSocialAvailability(
              availability,
            );
          }
        },
      )
      .catch(() => {
        if (active) {
          setSocialAvailability({
            google: false,
            apple: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [
    configured,
  ]);

  useEffect(() => {
    if (
      params.mode ===
      "create-account"
    ) {
      setMode(
        "create-account",
      );
    }
  }, [
    params.mode,
  ]);

  useEffect(() => {
    if (
      params.deleted === "1"
    ) {
      setErrorMessage("");
      setMessage(
        "Your Canal account was permanently deleted.",
      );
    }
  }, [
    params.deleted,
  ]);

  const formTitle =
    mode ===
    "sign-in"
      ? "Welcome back"
      : "Create your Canal";
  const formNote =
    mode ===
    "sign-in"
      ? "Return to the moment you left."
      : "Build your Canal identity first. Connect music after.";
  const isSubmitDisabled =
    loading ||
    !configured;
  const statusMessage =
    errorMessage ||
    message;
  const statusIsError =
    Boolean(
      errorMessage,
    );
  const inputStyle =
    useMemo(
      () => [
        styles.input,
        {
          color:
            colors.ink,
          borderColor:
            colors.line,
        },
      ],
      [
        colors.ink,
        colors.line,
      ],
    );

  const changeMode = (
    nextMode: LoginMode,
  ): void => {
    setMode(
      nextMode,
    );
    setFieldErrors(
      {},
    );
    setMessage("");
    setErrorMessage("");
  };

  const updateField = (
    field: keyof FieldErrors,
    value: string,
    update: (
      nextValue: string,
    ) => void,
  ): void => {
    update(
      value,
    );
    setFieldErrors(
      (current) => {
        if (!current[field]) {
          return current;
        }

        const next = {
          ...current,
        };
        delete next[field];
        return next;
      },
    );
    setErrorMessage(
      (current) =>
        current ===
        "Check the highlighted fields and try again."
          ? ""
          : current,
    );
  };

  const submitEmail =
    async (): Promise<void> => {
      if (
        loading ||
        authInFlightRef.current
      ) {
        return;
      }

      const errors =
        validateFields({
          mode,
          displayName,
          handle,
          email,
          password,
        });

      setFieldErrors(
        errors,
      );

      if (
        Object.keys(
          errors,
        ).length > 0
      ) {
        setErrorMessage(
          "Check the highlighted fields and try again.",
        );
        return;
      }

      authInFlightRef.current =
        true;
      setLoading(true);
      setMessage("");
      setErrorMessage("");

      try {
        if (
          mode ===
          "sign-in"
        ) {
          const session =
            await signInWithEmail(
              email,
              password,
            );

          await continueAfterAccountLogin(
            session,
          );
          return;
        }

        const result =
          await signUpWithEmail({
            email,
            password,
            displayName,
            handle,
          });

        if (
          result.needsEmailConfirmation
        ) {
          await rememberPendingSignup(
            email,
          );
          setMessage(
            "Your Canal account is ready. Confirm the email, then return here and sign in; your shared destination will still be waiting.",
          );
          setMode(
            "sign-in",
          );
          return;
        }

        if (!result.session) {
          throw new Error(
            "Canal created the account but did not return a usable session.",
          );
        }

        await markOnboardingRequired(
          result.session.user.id,
        );
        await continueAfterAccountLogin(
          result.session,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not authenticate your account.",
        );
      } finally {
        authInFlightRef.current =
          false;
        setLoading(false);
      }
    };

  const submitSocial =
    async (
      provider:
        | "google"
        | "apple",
    ): Promise<void> => {
      if (
        loading ||
        authInFlightRef.current ||
        socialAvailability?.[
          provider
        ] !== true
      ) {
        return;
      }

      authInFlightRef.current =
        true;
      setLoading(true);
      setMessage("");
      setErrorMessage("");

      try {
        const session =
          await signInWithSocial(
            provider,
          );

        if (
          isFirstSocialSignIn(
            session,
          )
        ) {
          await markOnboardingRequired(
            session.user.id,
          );
        }

        await continueAfterAccountLogin(
          session,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : `${provider} sign-in failed.`,
        );
      } finally {
        authInFlightRef.current =
          false;
        setLoading(false);
      }
    };

  return (
    <View
      style={
        styles.screen
      }
    >
      <StatusBar
        style={
          colorScheme ===
          "dark"
            ? "light"
            : "dark"
        }
      />
      <OnboardingAtmosphere palette="violet" />

      <SafeAreaView
        edges={[
          "top",
          "bottom",
        ]}
        style={
          styles.safeArea
        }
      >
        <KeyboardAvoidingView
          behavior={
            process.env.EXPO_OS ===
            "ios"
              ? "padding"
              : undefined
          }
          style={
            styles.screen
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.content
            }
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={
              false
            }
          >
            <OnboardingHeader palette="violet" />

            <View
              style={[
                styles.layout,
                isWide &&
                  styles.layoutWide,
              ]}
            >
              <View
                style={
                  styles.story
                }
              >
                <Text
                  selectable
                  style={[
                    styles.eyebrow,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  YOUR MUSIC, MADE SITUATIONAL
                </Text>

                <Text
                  selectable
                  style={[
                    styles.heroTitle,
                    {
                      color:
                        colors.ink,
                    },
                  ]}
                >
                  A living map of how you want life to sound.
                </Text>

                <Text
                  selectable
                  style={[
                    styles.heroCopy,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  Sign in once for Scenes, Canal Live, Snapshots, your Soundscape, and every shared link.
                </Text>

                {hasSharedSceneReturn ? (
                  <View
                    accessibilityLabel="A shared Scene is waiting after sign in"
                    style={[
                      styles.returnRow,
                      {
                        borderColor:
                          colors.line,
                      },
                    ]}
                  >
                    <Ionicons
                      color={
                        colors.ink
                      }
                      name="arrow-redo-outline"
                      size={22}
                    />
                    <View
                      style={
                        styles.flex
                      }
                    >
                      <Text
                        selectable
                        style={[
                          styles.returnTitle,
                          {
                            color:
                              colors.ink,
                          },
                        ]}
                      >
                        Your shared Scene is waiting
                      </Text>
                      <Text
                        selectable
                        style={[
                          styles.returnText,
                          {
                            color:
                              colors.muted,
                          },
                        ]}
                      >
                        Canal will bring you back after account setup.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View
                  style={
                    styles.featureGrid
                  }
                >
                  {[
                    [
                      "pulse-outline",
                      "Scenes",
                      "Intent-led playlists",
                    ],
                    [
                      "radio-outline",
                      "Canal Live",
                      "Shared taste in motion",
                    ],
                    [
                      "camera-outline",
                      "Snapshots",
                      "Music inside the moment",
                    ],
                    [
                      "planet-outline",
                      "Soundscape",
                      "Your evolving identity",
                    ],
                  ].map(
                    ([
                      icon,
                      label,
                      detail,
                    ]) => (
                      <View
                        key={
                          label
                        }
                        style={
                          styles.feature
                        }
                      >
                        <Ionicons
                          color={
                            colors.ink
                          }
                          name={
                            icon as keyof typeof Ionicons.glyphMap
                          }
                          size={20}
                        />
                        <View>
                          <Text
                            selectable
                            style={[
                              styles.featureTitle,
                              {
                                color:
                                  colors.ink,
                              },
                            ]}
                          >
                            {label}
                          </Text>
                          <Text
                            selectable
                            style={[
                              styles.featureText,
                              {
                                color:
                                  colors.muted,
                              },
                            ]}
                          >
                            {detail}
                          </Text>
                        </View>
                      </View>
                    ),
                  )}
                </View>
              </View>

              <OnboardingPanel
                accessibilityLabel="Canal account access"
                palette="violet"
                strong
                style={
                  styles.authPanel
                }
              >
                {hasSharedSceneReturn ? (
                  <View
                    style={[
                      styles.compactReturn,
                      {
                        borderColor:
                          colors.line,
                      },
                    ]}
                  >
                    <Ionicons
                      color={
                        colors.ink
                      }
                      name="musical-notes-outline"
                      size={18}
                    />
                    <Text
                      selectable
                      style={[
                        styles.compactReturnText,
                        {
                          color:
                            colors.muted,
                        },
                      ]}
                    >
                      Shared Scene preserved
                    </Text>
                  </View>
                ) : null}

                <View
                  accessibilityLabel="Account mode"
                  accessibilityRole="tablist"
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        colors.line,
                    },
                  ]}
                >
                  {(
                    [
                      [
                        "sign-in",
                        "Sign in",
                      ],
                      [
                        "create-account",
                        "Create account",
                      ],
                    ] as const
                  ).map(
                    ([
                      value,
                      label,
                    ]) => (
                      <Pressable
                        accessibilityRole="tab"
                        accessibilityState={{
                          selected:
                            mode ===
                            value,
                        }}
                        key={
                          value
                        }
                        onPress={() =>
                          changeMode(
                            value,
                          )
                        }
                        style={[
                          styles.segmentButton,
                          mode ===
                            value && {
                            backgroundColor:
                              colors.glassStrong,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            {
                              color:
                                colors.ink,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>

                <Text
                  selectable
                  style={[
                    styles.formTitle,
                    {
                      color:
                        colors.ink,
                    },
                  ]}
                >
                  {formTitle}
                </Text>
                <Text
                  selectable
                  style={[
                    styles.formNote,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  {formNote}
                </Text>

                {!configured ? (
                  <View
                    accessibilityRole="alert"
                    style={
                      styles.configurationBox
                    }
                  >
                    <Text
                      selectable
                      style={[
                        styles.configurationTitle,
                        {
                          color:
                            colors.danger,
                        },
                      ]}
                    >
                      Supabase setup required
                    </Text>
                    <Text
                      selectable
                      style={[
                        styles.configurationText,
                        {
                          color:
                            colors.danger,
                        },
                      ]}
                    >
                      Canal is missing its public Supabase URL or publishable key.
                    </Text>
                  </View>
                ) : null}

                <View
                  style={
                    styles.fields
                  }
                >
                  {mode ===
                  "create-account" ? (
                    <>
                      <Field
                        color={
                          colors.ink
                        }
                        errorColor={
                          colors.danger
                        }
                        error={
                          fieldErrors.displayName
                        }
                        label="Display name"
                      >
                        <TextInput
                          accessibilityLabel="Display name"
                          autoCapitalize="words"
                          autoComplete="name"
                          maxLength={60}
                          onChangeText={(value) =>
                            updateField(
                              "displayName",
                              value,
                              setDisplayName,
                            )
                          }
                          placeholder="How you’ll appear"
                          placeholderTextColor={
                            colors.muted
                          }
                          style={
                            inputStyle
                          }
                          value={
                            displayName
                          }
                        />
                      </Field>
                      <Field
                        color={
                          colors.ink
                        }
                        errorColor={
                          colors.danger
                        }
                        error={
                          fieldErrors.handle
                        }
                        label="Handle"
                      >
                        <TextInput
                          accessibilityLabel="Handle"
                          autoCapitalize="none"
                          autoComplete="username-new"
                          autoCorrect={
                            false
                          }
                          maxLength={24}
                          onChangeText={(value) =>
                            updateField(
                              "handle",
                              value,
                              setHandle,
                            )
                          }
                          placeholder="@yourhandle"
                          placeholderTextColor={
                            colors.muted
                          }
                          style={
                            inputStyle
                          }
                          value={
                            handle
                          }
                        />
                      </Field>
                    </>
                  ) : null}

                  <Field
                    color={
                      colors.ink
                    }
                    errorColor={
                      colors.danger
                    }
                    error={
                      fieldErrors.email
                    }
                    label="Email"
                  >
                    <TextInput
                      accessibilityLabel="Email"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={
                        false
                      }
                      keyboardType="email-address"
                      onChangeText={(value) =>
                        updateField(
                          "email",
                          value,
                          setEmail,
                        )
                      }
                      placeholder="you@example.com"
                      placeholderTextColor={
                        colors.muted
                      }
                      style={
                        inputStyle
                      }
                      textContentType="emailAddress"
                      value={
                        email
                      }
                    />
                  </Field>

                  <Field
                    color={
                      colors.ink
                    }
                    errorColor={
                      colors.danger
                    }
                    error={
                      fieldErrors.password
                    }
                    label="Password"
                  >
                    <View
                      style={
                        styles.passwordField
                      }
                    >
                      <TextInput
                        accessibilityLabel="Password"
                        autoComplete={
                          mode ===
                          "sign-in"
                            ? "current-password"
                            : "new-password"
                        }
                        onChangeText={(value) =>
                          updateField(
                            "password",
                            value,
                            setPassword,
                          )
                        }
                        placeholder="At least 8 characters"
                        placeholderTextColor={
                          colors.muted
                        }
                        secureTextEntry={
                          !showPassword
                        }
                        style={[
                          inputStyle,
                          styles.passwordInput,
                        ]}
                        textContentType={
                          mode ===
                          "sign-in"
                            ? "password"
                            : "newPassword"
                        }
                        value={
                          password
                        }
                      />
                      <Pressable
                        accessibilityLabel={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        accessibilityRole="button"
                        onPress={() =>
                          setShowPassword(
                            (current) =>
                              !current,
                          )
                        }
                        style={
                          styles.passwordButton
                        }
                      >
                        <Text
                          style={[
                            styles.passwordButtonText,
                            {
                              color:
                                colors.ink,
                            },
                          ]}
                        >
                          {showPassword
                            ? "Hide"
                            : "Show"}
                        </Text>
                      </Pressable>
                    </View>
                  </Field>
                </View>

                {mode ===
                "sign-in" ? (
                  <Pressable
                    accessibilityLabel="Forgot password"
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        "/auth/forgot-password" as never,
                      )
                    }
                    style={
                      styles.forgotButton
                    }
                  >
                    <Text
                      style={[
                        styles.forgotText,
                        {
                          color:
                            colors.ink,
                        },
                      ]}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                ) : null}

                <OnboardingButton
                  disabled={
                    isSubmitDisabled
                  }
                  label={
                    mode ===
                    "sign-in"
                      ? "Sign in to Canal"
                      : "Create Canal account"
                  }
                  loading={
                    loading
                  }
                  onPress={() =>
                    void submitEmail()
                  }
                  palette="violet"
                />

                <View
                  style={
                    styles.dividerRow
                  }
                >
                  <View
                    style={[
                      styles.divider,
                      {
                        backgroundColor:
                          colors.line,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.dividerText,
                      {
                        color:
                          colors.muted,
                      },
                    ]}
                  >
                    OR
                  </Text>
                  <View
                    style={[
                      styles.divider,
                      {
                        backgroundColor:
                          colors.line,
                      },
                    ]}
                  />
                </View>

                <View
                  style={
                    styles.socialRow
                  }
                >
                  <OnboardingButton
                    accessibilityHint={
                      socialAvailability?.google ===
                      true
                        ? "Sign in to Canal with Google"
                        : "Google sign-in is temporarily unavailable"
                    }
                    disabled={
                      isSubmitDisabled ||
                      socialAvailability?.google !==
                        true
                    }
                    icon="logo-google"
                    label="Google"
                    onPress={() =>
                      void submitSocial(
                        "google",
                      )
                    }
                    palette="violet"
                    secondary
                  />
                  <OnboardingButton
                    accessibilityHint={
                      socialAvailability?.apple ===
                      true
                        ? "Sign in to Canal with Apple"
                        : "Apple sign-in is temporarily unavailable"
                    }
                    disabled={
                      isSubmitDisabled ||
                      socialAvailability?.apple !==
                        true
                    }
                    icon="logo-apple"
                    label="Apple"
                    onPress={() =>
                      void submitSocial(
                        "apple",
                      )
                    }
                    palette="violet"
                    secondary
                  />
                </View>

                {statusMessage ? (
                  <View
                    accessibilityLiveRegion="polite"
                    accessibilityRole={
                      statusIsError
                        ? "alert"
                        : "summary"
                    }
                    style={[
                      styles.statusBox,
                      statusIsError
                        ? styles.errorBox
                        : styles.messageBox,
                    ]}
                  >
                    <Text
                      selectable
                      style={[
                        styles.statusText,
                        {
                          color:
                            statusIsError
                              ? colors.danger
                              : colors.success,
                        },
                      ]}
                    >
                      {statusMessage}
                    </Text>
                  </View>
                ) : null}

                <Text
                  selectable
                  style={[
                    styles.privacy,
                    {
                      color:
                        colors.muted,
                    },
                  ]}
                >
                  {mode ===
                  "create-account"
                    ? "Canal authentication stays separate from Spotify authorization. You can review account and privacy controls after setup."
                    : "Canal authentication stays separate from Spotify authorization."}
                </Text>
              </OnboardingPanel>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Field(
  props: {
    label: string;
    error?: string;
    errorColor: string;
    color: string;
    children: ReactNode;
  },
) {
  return (
    <View
      style={
        styles.field
      }
    >
      <Text
        style={[
          styles.fieldLabel,
          {
            color:
              props.color,
          },
        ]}
      >
        {props.label}
      </Text>
      {props.children}
      {props.error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          selectable
          style={[
            styles.fieldError,
            {
              color:
                props.errorColor,
            },
          ]}
        >
          {props.error}
        </Text>
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      backgroundColor:
        "transparent",
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 34,
      gap: 22,
    },
    layout: {
      flex: 1,
      gap: 24,
      justifyContent:
        "center",
    },
    layoutWide: {
      flexDirection:
        "row",
      alignItems:
        "center",
      alignSelf:
        "center",
      width: "100%",
      maxWidth: 980,
      gap: 38,
    },
    story: {
      flex: 1.08,
      gap: 14,
      paddingVertical: 12,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight:
        "500",
      letterSpacing: 1.6,
    },
    heroTitle: {
      maxWidth: 600,
      fontFamily:
        "Georgia",
      fontSize: 46,
      lineHeight: 47,
      fontWeight:
        "400",
      letterSpacing: -2.2,
    },
    heroCopy: {
      maxWidth: 520,
      fontSize: 15,
      lineHeight: 23,
    },
    flex: {
      flex: 1,
    },
    returnRow: {
      maxWidth: 520,
      minHeight: 62,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      paddingVertical: 10,
    },
    returnTitle: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    returnText: {
      marginTop: 2,
      fontSize: 10,
      lineHeight: 15,
    },
    featureGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 14,
      paddingTop: 8,
    },
    feature: {
      minWidth: 150,
      flexGrow: 1,
      flexBasis: "45%",
      minHeight: 74,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
    },
    featureTitle: {
      fontFamily:
        "Georgia",
      fontSize: 16,
      fontWeight:
        "400",
    },
    featureText: {
      marginTop: 2,
      fontSize: 9,
    },
    authPanel: {
      flex: 0.92,
      width: "100%",
      maxWidth: 450,
      alignSelf:
        "center",
    },
    compactReturn: {
      minHeight: 38,
      borderBottomWidth: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
      paddingBottom: 10,
      marginBottom: 12,
    },
    compactReturnText: {
      fontSize: 10,
      fontWeight:
        "500",
    },
    segment: {
      borderRadius: 16,
      borderCurve:
        "continuous",
      padding: 4,
      flexDirection:
        "row",
      gap: 4,
    },
    segmentButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 13,
      borderCurve:
        "continuous",
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    segmentText: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    formTitle: {
      marginTop: 18,
      fontFamily:
        "Georgia",
      fontSize: 29,
      lineHeight: 32,
      fontWeight:
        "400",
      letterSpacing: -1,
    },
    formNote: {
      marginTop: 3,
      marginBottom: 12,
      fontSize: 11,
      lineHeight: 16,
    },
    fields: {
      gap: 10,
    },
    field: {
      gap: 3,
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight:
        "500",
      letterSpacing: 0.8,
      textTransform:
        "uppercase",
    },
    input: {
      minHeight: 48,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderRadius: 0,
      backgroundColor:
        "transparent",
      paddingHorizontal: 2,
      paddingVertical: 8,
      fontSize: 15,
    },
    fieldError: {
      fontSize: 10,
      lineHeight: 14,
    },
    passwordField: {
      position:
        "relative",
    },
    passwordInput: {
      paddingRight: 58,
    },
    passwordButton: {
      position:
        "absolute",
      right: 0,
      top: 0,
      minWidth: 52,
      minHeight: 48,
      alignItems:
        "flex-end",
      justifyContent:
        "center",
    },
    passwordButtonText: {
      fontSize: 10,
      fontWeight:
        "500",
    },
    forgotButton: {
      alignSelf:
        "flex-end",
      minHeight: 48,
      justifyContent:
        "center",
    },
    forgotText: {
      fontSize: 11,
      fontWeight:
        "500",
    },
    dividerRow: {
      minHeight: 36,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
    },
    divider: {
      flex: 1,
      height: 1,
    },
    dividerText: {
      fontSize: 9,
      fontWeight:
        "500",
    },
    socialRow: {
      flexDirection:
        "row",
      gap: 9,
    },
    configurationBox: {
      marginBottom: 12,
      borderRadius: 16,
      borderCurve:
        "continuous",
      padding: 12,
      backgroundColor:
        "rgba(170, 63, 61, 0.13)",
    },
    configurationTitle: {
      fontSize: 12,
      fontWeight:
        "500",
    },
    configurationText: {
      marginTop: 3,
      fontSize: 10,
      lineHeight: 15,
    },
    statusBox: {
      borderRadius: 14,
      borderCurve:
        "continuous",
      padding: 11,
      marginTop: 10,
    },
    messageBox: {
      backgroundColor:
        "rgba(54, 159, 104, 0.15)",
    },
    errorBox: {
      backgroundColor:
        "rgba(183, 63, 76, 0.14)",
    },
    statusText: {
      fontSize: 10,
      lineHeight: 15,
    },
    privacy: {
      marginTop: 12,
      fontSize: 9,
      lineHeight: 14,
      textAlign:
        "center",
    },
  });

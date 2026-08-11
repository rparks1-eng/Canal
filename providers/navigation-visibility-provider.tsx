import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type NavigationVisibilityContextValue = {
  hidden: boolean;
  hide: () => () => void;
};

const NavigationVisibilityContext =
  createContext<NavigationVisibilityContextValue>({
    hidden: false,
    hide: () => () => undefined,
  });

export function CanalNavigationVisibilityProvider({
  children,
}: PropsWithChildren) {
  const [hiddenOwnerCount, setHiddenOwnerCount] = useState(0);
  const hide = useCallback(() => {
    let active = true;
    setHiddenOwnerCount((count) => count + 1);

    return () => {
      if (!active) return;
      active = false;
      setHiddenOwnerCount((count) => Math.max(0, count - 1));
    };
  }, []);
  const value = useMemo(
    () => ({ hidden: hiddenOwnerCount > 0, hide }),
    [hiddenOwnerCount, hide],
  );

  return (
    <NavigationVisibilityContext.Provider value={value}>
      {children}
    </NavigationVisibilityContext.Provider>
  );
}

export function useCanalNavigationHidden(): boolean {
  return useContext(NavigationVisibilityContext).hidden;
}

export function useHideCanalNavigation(): void {
  const { hide } = useContext(NavigationVisibilityContext);

  useEffect(() => hide(), [hide]);
}

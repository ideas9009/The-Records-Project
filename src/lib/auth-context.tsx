import { canRetainOfflineSession, setSyncIdentity } from "./smart-sync";
import ConnectionScreen from "../components/ConnectionScreen";
import {
  connectionStage,
  setConnectionStage,
  subscribeConnection,
} from "./connection-progress";
import "../pages/Login.css";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PREVIEW_MODE, previewAccount } from "./runtime-mode";
import { ApiError, session, watchResource } from "./api";
import type { Account } from "./cloud-auth";
const AuthContext = createContext<{
  account: Account | null;
  loading: boolean;
  error: string;
  retry: () => void;
}>({ account: null, loading: true, error: "", retry: () => {} });
function ServerAuthProvider({ children, preload = false }: { children: ReactNode; preload?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stop: undefined | (() => void);
    const connect = () => {
      let verifiedAt = 0;
      stop?.();
      setAccount(null);
      setError("");
      setConnectionStage("session");
      if (!session()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setConnectionStage("waiting");
      stop = watchResource<{ account: Account }>(
        "/api/auth/me",
        (result) => {
          verifiedAt = Date.now();
          setConnectionStage("ready");
          setAccount(result.account);
          setLoading(false);
          setError("");
        },
        (reason) => {
          setLoading(false);
          const denied = reason instanceof ApiError && reason.status < 500;
          if (denied) setSyncIdentity(null);
          if (denied || !canRetainOfflineSession(verifiedAt))
            setError(reason.message);
        },
        {eager:preload},
      );
    };
    connect();
    window.addEventListener("records-session", connect);
    const storage=(event:StorageEvent)=>{if(event.key==="records-desktop-session")connect()};
    window.addEventListener("storage",storage);
    return () => {
      stop?.();
      window.removeEventListener("records-session", connect);
      window.removeEventListener("storage",storage);
    };
  }, [attempt, preload]);
  return (
    <AuthContext.Provider
      value={{
        account,
        loading,
        error,
        retry: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function ConnectionStatus() {
  const { loading, error, retry } = useAuth();
  const stage = useSyncExternalStore(
    subscribeConnection,
    connectionStage,
    () => "session" as const,
  );
  return (
    <ConnectionScreen
      stage={stage}
      error={loading ? "" : error || "Your account could not be loaded."}
      onRetry={retry}
    />
  );
}

export function AuthProvider({ children, preload = false }: { children: ReactNode; preload?: boolean }) {
  return PREVIEW_MODE ? (
    <AuthContext.Provider
      value={{
        account: previewAccount,
        loading: false,
        error: "",
        retry: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  ) : (
    <ServerAuthProvider preload={preload}>{children}</ServerAuthProvider>
  );
}

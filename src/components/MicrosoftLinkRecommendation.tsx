import { useEffect, useState } from "react";
import { microsoftConfig } from "../lib/microsoft";
import { useAuth } from "../lib/auth-context";
import "./microsoft-verification.css";
export default function MicrosoftLinkRecommendation({
  onLink,
}: {
  onLink: () => void;
}) {
  const { account } = useAuth(),
    [enabled, setEnabled] = useState(false),
    [dismissed, setDismissed] = useState(true);
  const key = account ? "records-microsoft-link-dismissed:" + account.uid : "";
  useEffect(() => {
    let active = true;
    setEnabled(false);
    try {
      setDismissed(!key || localStorage.getItem(key) === "true");
    } catch {
      setDismissed(false);
    }
    if (account && !account.minecraftVerified)
      void microsoftConfig()
        .then((config) => {
          if (active) setEnabled(config.enabled);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [account?.uid, account?.minecraftVerified, key]);
  if (!account || account.minecraftVerified || !enabled || dismissed)
    return null;
  return (
    <section
      className="card microsoft-recommendation"
      aria-label="Microsoft account recommendation"
    >
      <div>
        <h2>Recommended: Link with Microsoft</h2>
        <p>Verify your Minecraft account and enable Microsoft sign-in.</p>
      </div>
      <div className="microsoft-recommendation-actions">
        <button
          onClick={() => {
            setDismissed(true);
            onLink();
          }}
        >
          Link with Microsoft
        </button>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(key, "true");
            } catch {}
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}

import { startBackgroundPolling } from "./background-polling";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { earthmc } from "./native";
export function useVoteParty(alerts = false, refreshKey = 0) {
  const [target, setTarget] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let previous: number | null = null;
    let cancelled = false,
      running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const data = await earthmc("/");
        const count = data?.voteParty?.numRemaining;
        if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
          throw Error("Vote-party data unavailable.");
        if (!cancelled) {
          if (
            alerts &&
            isTauri() &&
            localStorage.getItem("records-vote-alerts") === "true" &&
            previous !== null &&
            ((previous > 250 && count <= 250) ||
              (previous > 100 && count <= 100))
          )
            void invoke("notify_vote_party", { remaining: count }).catch(
              console.error,
            );
          previous = count;
          setRemaining(count);
          const goal = data?.voteParty?.target;
          setTarget(
            typeof goal === "number" && Number.isFinite(goal) && goal > 0
              ? goal
              : null,
          );
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        running = false;
      }
    }
    const stopPolling = startBackgroundPolling(load);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [alerts, refreshKey]);
  return { remaining, target, error };
}

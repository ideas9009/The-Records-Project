import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { earthmc } from "./native";
export function useVoteParty(alerts = false) {
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
        const count = Number(data?.voteParty?.numRemaining);
        if (!Number.isFinite(count))
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
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        running = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [alerts]);
  return { remaining, error };
}

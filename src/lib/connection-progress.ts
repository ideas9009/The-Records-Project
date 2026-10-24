export const connectionStages = {
  session: { detail: "Checking your saved sign-in…", completed: 0 },
  waiting: { detail: "Waiting for the sign-in service…", completed: 1 },
  reading: { detail: "Reading your account details…", completed: 2 },
  preparing: { detail: "Preparing your session…", completed: 3 },
  ready: { detail: "Connection ready", completed: 4 },
} as const;
export type ConnectionStage = keyof typeof connectionStages;
let stage: ConnectionStage = "session";
const listeners = new Set<() => void>();
export const connectionStage = () => stage;
export function setConnectionStage(next: ConnectionStage) {
  if (next === stage) return;
  stage = next;
  for (const listener of listeners) listener();
}
export function subscribeConnection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

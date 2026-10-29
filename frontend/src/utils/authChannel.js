/**
 * Cross-tab auth events (sign-out in one tab signs out every tab).
 * Falls back to a no-op where BroadcastChannel is unavailable.
 */
const CHANNEL_NAME = "flowengine-auth";

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

export const authChannel = {
  announceSignOut: () => channel?.postMessage({ type: "signed-out" }),
  onSignOut: (handler) => {
    if (!channel) return () => {};
    const listener = (event) => event.data?.type === "signed-out" && handler();
    channel.addEventListener("message", listener);
    return () => channel.removeEventListener("message", listener);
  },
};

import { create } from "zustand"
import type { ConnectionStatus, ClientMessage } from "@talos/shared/types"

type SendFn = (message: ClientMessage) => void;

interface ConnectionState {
  status: ConnectionStatus;
  reconnectAttempts: number;
  sendFn: SendFn | null;
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setSendFn: (fn: SendFn) => void;
  send: (message: ClientMessage) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "disconnected",
  reconnectAttempts: 0,
  sendFn: null,
  setStatus: (status) => set({ status }),
  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
  setSendFn: (fn) => set({ sendFn: fn }),
  send: (message) => {
    const { sendFn } = get()
    if (sendFn) {
      sendFn(message)
    } else {
      console.warn("[ConnectionStore] Cannot send — no WebSocket connection")
    }
  },
}))

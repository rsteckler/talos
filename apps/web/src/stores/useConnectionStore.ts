import { create } from "zustand"
import type { ConnectionStatus } from "@talos/shared/types"

interface ConnectionState {
  status: ConnectionStatus;
  reconnectAttempts: number;
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  reconnectAttempts: 0,
  setStatus: (status) => set({ status }),
  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}))

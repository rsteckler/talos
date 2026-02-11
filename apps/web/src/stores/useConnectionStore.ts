import { create } from "zustand"
import type { ConnectionStatus, ClientMessage, AgentStatus } from "@talos/shared/types"

type SendFn = (message: ClientMessage) => void;

interface ConnectionState {
  status: ConnectionStatus;
  agentStatus: AgentStatus;
  reconnectAttempts: number;
  sendFn: SendFn | null;
  latestStatusLog: string | null;
  setStatus: (status: ConnectionStatus) => void;
  setAgentStatus: (status: AgentStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setSendFn: (fn: SendFn) => void;
  send: (message: ClientMessage) => void;
  setLatestStatusLog: (msg: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "disconnected",
  agentStatus: "idle",
  reconnectAttempts: 0,
  sendFn: null,
  latestStatusLog: null,
  setStatus: (status) => set({ status }),
  setAgentStatus: (status) => set({ agentStatus: status }),
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
  setLatestStatusLog: (msg) => set({ latestStatusLog: msg }),
}))

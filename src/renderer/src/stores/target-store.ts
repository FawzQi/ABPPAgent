import { create } from "zustand";
import type { WebChatTargetId, WebChatTargetInfo } from "@shared/types";

interface TargetStore {
  targets: WebChatTargetInfo[];
  selectedTargetId: WebChatTargetId;
  setTargets: (targets: WebChatTargetInfo[]) => void;
  updateTargetStatus: (info: WebChatTargetInfo) => void;
  setSelectedTargetId: (targetId: WebChatTargetId) => void;
  refreshTargets: () => Promise<void>;
  openTargetWindow: (targetId: WebChatTargetId) => Promise<void>;
}

export const useTargetStore = create<TargetStore>((set, get) => ({
  targets: [
    {
      id: "deepseek",
      label: "DeepSeek",
      url: "https://chat.deepseek.com/",
      status: "idle",
      isReady: false,
    },
    {
      id: "qwen",
      label: "Qwen",
      url: "https://chat.qwen.ai/",
      status: "idle",
      isReady: false,
    },
    {
      id: "glm",
      label: "GLM (Z.ai)",
      url: "https://chat.z.ai/",
      status: "idle",
      isReady: false,
    },
  ],
  selectedTargetId: "deepseek",
  setTargets: (targets) => set({ targets }),
  updateTargetStatus: (info) =>
    set((state) => ({
      targets: state.targets.map((t) =>
        t.id === info.id ? { ...t, ...info } : t,
      ),
    })),
  setSelectedTargetId: (selectedTargetId) => set({ selectedTargetId }),
  refreshTargets: async () => {
    if (window.agentApi) {
      const targets = await window.agentApi.getTargets();
      set({ targets });
    }
  },
  openTargetWindow: async (targetId) => {
    if (window.agentApi) {
      await window.agentApi.openTargetWindow(targetId);
      get().refreshTargets();
    }
  },
}));

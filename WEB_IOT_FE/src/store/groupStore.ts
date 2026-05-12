import { defineStore } from "pinia";

import { apiRequest } from "../lib/api";
import { useAuthStore } from "./authStore";

export type DeviceGroup = {
  id: string;
  name: string;
  createdAt: string;
  deviceCount: number;
};

export type DeviceGroupDetail = {
  id: string;
  name: string;
  createdAt: string;
  deviceIds: string[];
};

export const useGroupStore = defineStore("groups", {
  state: () => ({
    groups: [] as DeviceGroup[],
    groupDetails: {} as Record<string, DeviceGroupDetail>,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async loadGroups() {
      const auth = useAuthStore();
      if (!auth.accessToken) return;
      this.loading = true;
      this.error = null;
      try {
        const data = await apiRequest<{ groups: DeviceGroup[] }>("/groups", {
          token: auth.accessToken,
        });
        this.groups = data.groups ?? [];
      } catch (err) {
        this.error =
          err instanceof Error ? err.message : "Failed to load groups";
      } finally {
        this.loading = false;
      }
    },
    async loadGroupDetail(id: string) {
      const auth = useAuthStore();
      if (!auth.accessToken) throw new Error("Not authenticated");
      const groupId = (id ?? "").trim();
      if (!groupId) throw new Error("Group is required");
      const data = await apiRequest<{
        group: { id: string; name: string; createdAt: string };
        deviceIds: string[];
      }>(`/groups/${groupId}`, {
        token: auth.accessToken,
      });
      const detail: DeviceGroupDetail = {
        id: data.group.id,
        name: data.group.name,
        createdAt: data.group.createdAt,
        deviceIds: data.deviceIds ?? [],
      };
      this.groupDetails[groupId] = detail;
      return detail;
    },
    async createGroup(name: string) {
      const auth = useAuthStore();
      if (!auth.accessToken) throw new Error("Not authenticated");
      const nextName = (name ?? "").trim();
      if (!nextName) throw new Error("Group name is required");
      const data = await apiRequest<{ group: DeviceGroup }>("/groups", {
        method: "POST",
        token: auth.accessToken,
        body: { name: nextName },
      });
      this.groups = [data.group, ...this.groups];
      return data.group;
    },
    async renameGroup(id: string, name: string) {
      const auth = useAuthStore();
      if (!auth.accessToken) throw new Error("Not authenticated");
      const nextName = (name ?? "").trim();
      if (!nextName) throw new Error("Group name is required");
      const data = await apiRequest<{ group: DeviceGroup }>(`/groups/${id}`, {
        method: "PATCH",
        token: auth.accessToken,
        body: { name: nextName },
      });
      this.groups = this.groups.map((g) =>
        g.id === id ? { ...g, name: data.group.name } : g,
      );
      const detail = this.groupDetails[id];
      if (detail) detail.name = data.group.name;
      return data.group;
    },
    async deleteGroup(id: string) {
      const auth = useAuthStore();
      if (!auth.accessToken) throw new Error("Not authenticated");
      await apiRequest(`/groups/${id}`, {
        method: "DELETE",
        token: auth.accessToken,
      });
      this.groups = this.groups.filter((g) => g.id !== id);
      delete this.groupDetails[id];
    },
    async updateGroupDevices(id: string, deviceIds: string[]) {
      const auth = useAuthStore();
      if (!auth.accessToken) throw new Error("Not authenticated");
      const data = await apiRequest<{ deviceIds: string[] }>(
        `/groups/${id}/devices`,
        {
          method: "PUT",
          token: auth.accessToken,
          body: { deviceIds },
        },
      );
      const detail = this.groupDetails[id];
      if (detail) detail.deviceIds = data.deviceIds ?? [];
      const group = this.groups.find((g) => g.id === id);
      if (group) group.deviceCount = (data.deviceIds ?? []).length;
      return data.deviceIds ?? [];
    },
  },
});

import { Router } from "express";

import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.get("/", async (req, res) => {
  const userId = req.user!.id;

  const groups = await prisma.deviceGroup.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });

  return res.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      deviceCount: g._count.members,
    })),
  });
});

groupsRouter.post("/", async (req, res) => {
  const userId = req.user!.id;
  const { name } = (req.body ?? {}) as { name?: unknown };

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Missing name" });
  }

  const group = await prisma.deviceGroup.create({
    data: { userId, name: name.trim() },
    select: { id: true, name: true, createdAt: true },
  });

  return res.status(201).json({ group });
});

groupsRouter.get("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const group = await prisma.deviceGroup.findFirst({
    where: { id, userId },
    select: { id: true, name: true, createdAt: true },
  });

  if (!group) return res.status(404).json({ error: "Group not found" });

  const members = await prisma.deviceGroupMember.findMany({
    where: { groupId: group.id },
    select: { deviceId: true },
  });

  return res.json({
    group,
    deviceIds: members.map((m) => m.deviceId),
  });
});

groupsRouter.patch("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const { name } = (req.body ?? {}) as { name?: unknown };

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Missing name" });
  }

  const updated = await prisma.deviceGroup.updateMany({
    where: { id, userId },
    data: { name: name.trim() },
  });

  if (!updated.count) return res.status(404).json({ error: "Group not found" });

  const group = await prisma.deviceGroup.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true },
  });

  return res.json({ group });
});

groupsRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;

  const existing = await prisma.deviceGroup.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) return res.status(404).json({ error: "Group not found" });

  await prisma.deviceGroup.delete({ where: { id } });
  return res.status(204).send();
});

groupsRouter.put("/:id/devices", async (req, res) => {
  const userId = req.user!.id;
  const id = req.params.id;
  const { deviceIds } = (req.body ?? {}) as { deviceIds?: unknown };

  if (!Array.isArray(deviceIds)) {
    return res.status(400).json({ error: "deviceIds must be an array" });
  }

  const group = await prisma.deviceGroup.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!group) return res.status(404).json({ error: "Group not found" });

  const allowedDevices = await prisma.device.findMany({
    where: { userId },
    select: { id: true },
  });

  const allowedSet = new Set(allowedDevices.map((d) => d.id));
  const uniqueIds = Array.from(new Set(deviceIds)).filter(
    (value): value is string => typeof value === "string" && allowedSet.has(value),
  );

  await prisma.$transaction(async (tx) => {
    await tx.deviceGroupMember.deleteMany({ where: { groupId: id } });
    if (uniqueIds.length) {
      await tx.deviceGroupMember.createMany({
        data: uniqueIds.map((deviceId) => ({ groupId: id, deviceId })),
      });
    }
  });

  return res.json({ deviceIds: uniqueIds });
});

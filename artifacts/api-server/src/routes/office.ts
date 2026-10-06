import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, gt, lt, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AcknowledgeAlertParams,
  AcknowledgeAlertResponse,
  CreateBookingBody,
  CreateBookingResponse,
  GetAlertsResponse,
  GetAutomationResponse,
  GetBookingsResponse,
  GetDashboardResponse,
  GetDevicesResponse,
  GetEnergyQueryParams,
  GetEnergyResponse,
  GetRoomsResponse,
  RunSimulatorActionBody,
  RunSimulatorActionResponse,
  UpdateAutomationBody,
  UpdateAutomationResponse,
  UpdateDeviceBody,
  UpdateDeviceParams,
  UpdateDeviceResponse,
  UpdateRoomControlsBody,
  UpdateRoomControlsParams,
  UpdateRoomControlsResponse,
} from "@workspace/api-zod";
import {
  activitiesTable,
  alertsTable,
  bookingsTable,
  db,
  devicesTable,
  energyReadingsTable,
  officeSettingsTable,
  roomsTable,
} from "@workspace/db";
import { requireOfficeRoles } from "../middlewares/officeAuthorization";

const router: IRouter = Router();
const defaultTariff = 8;

const roomDto = (room: typeof roomsTable.$inferSelect) => ({
  ...room,
  overrideUntil: room.overrideUntil?.toISOString() ?? null,
});

const alertDto = (alert: typeof alertsTable.$inferSelect) => ({
  ...alert,
  createdAt: alert.createdAt.toISOString(),
});

const activityDto = (activity: typeof activitiesTable.$inferSelect) => ({
  ...activity,
  createdAt: activity.createdAt.toISOString(),
});

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function logActivity(
  action: string,
  detail: string,
  actor = "Smart Office",
): Promise<void> {
  await db.insert(activitiesTable).values({
    id: id("activity"),
    action,
    detail,
    actor,
  });
}

async function getSettings() {
  const [settings] = await db
    .select()
    .from(officeSettingsTable)
    .where(eq(officeSettingsTable.id, "default"));
  if (settings) return settings;
  const [created] = await db
    .insert(officeSettingsTable)
    .values({ id: "default" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [retried] = await db
    .select()
    .from(officeSettingsTable)
    .where(eq(officeSettingsTable.id, "default"));
  if (!retried) throw new Error("Office settings could not be initialized");
  return retried;
}

async function roomsWithCurrentMeetings() {
  const rooms = await db.select().from(roomsTable).orderBy(roomsTable.name);
  const now = new Date();
  const activeBookings = await db
    .select({
      roomId: bookingsTable.roomId,
      title: bookingsTable.title,
    })
    .from(bookingsTable)
    .where(
      and(
        lt(bookingsTable.startsAt, now),
        gt(bookingsTable.endsAt, now),
      ),
    );
  const meetingsByRoom = new Map(
    activeBookings.map((booking) => [booking.roomId, booking.title]),
  );
  return rooms.map((room) => ({
    ...roomDto(room),
    currentMeeting: room.currentMeeting ?? meetingsByRoom.get(room.id) ?? null,
  }));
}

async function energyAnalytics(period: "day" | "week" | "month") {
  const now = new Date();
  const hours = period === "day" ? 24 : period === "week" ? 24 * 7 : 24 * 30;
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const readings = await db
    .select()
    .from(energyReadingsTable)
    .where(gte(energyReadingsTable.observedAt, from))
    .orderBy(energyReadingsTable.observedAt);
  const rooms = await db.select().from(roomsTable);
  const settings = await getSettings();
  const byRoomValues = new Map<string, number>();
  const buckets = new Map<string, { actual: number; baseline: number }>();
  let lighting = 0;
  let hvac = 0;
  let equipment = 0;
  let baselineTotal = 0;

  for (const reading of readings) {
    const actual =
      reading.lightingKwh + reading.hvacKwh + reading.equipmentKwh;
    lighting += reading.lightingKwh;
    hvac += reading.hvacKwh;
    equipment += reading.equipmentKwh;
    baselineTotal += reading.baselineKwh;
    if (reading.roomId) {
      byRoomValues.set(
        reading.roomId,
        (byRoomValues.get(reading.roomId) ?? 0) + actual,
      );
    }
    const date = reading.observedAt;
    const key =
      period === "day"
        ? `${String(date.getHours()).padStart(2, "0")}:00`
        : date.toLocaleDateString("en-IN", {
            weekday: period === "week" ? "short" : undefined,
            day: "numeric",
            month: period === "month" ? "short" : undefined,
            timeZone: "Asia/Kolkata",
          });
    const bucket = buckets.get(key) ?? { actual: 0, baseline: 0 };
    bucket.actual += actual;
    bucket.baseline += reading.baselineKwh;
    buckets.set(key, bucket);
  }

  const totalKwh = lighting + hvac + equipment;
  const currentRooms = await db.select().from(roomsTable);
  const peakKw = currentRooms.reduce(
    (peak, room) => Math.max(peak, room.energyKw),
    0,
  );
  const currentRoomUsage = new Map<string, number>();
  for (const room of rooms) {
    currentRoomUsage.set(room.id, byRoomValues.get(room.id) ?? 0);
  }
  return {
    period,
    totalKwh: Number(totalKwh.toFixed(1)),
    cost: Number((totalKwh * settings.tariff).toFixed(2)),
    peakKw: Number(peakKw.toFixed(1)),
    savedPercent:
      baselineTotal > 0
        ? Number(
            (Math.max(0, ((baselineTotal - totalKwh) / baselineTotal) * 100)).toFixed(1),
          )
        : 18,
    tariff: settings.tariff || defaultTariff,
    series: [...buckets.entries()].map(([label, values]) => ({
      label,
      actual: Number(values.actual.toFixed(2)),
      baseline: Number(values.baseline.toFixed(2)),
    })),
    byRoom: rooms
      .map((room) => ({
        roomId: room.id,
        roomName: room.name,
        kwh: Number((currentRoomUsage.get(room.id) ?? 0).toFixed(1)),
      }))
      .sort((a, b) => b.kwh - a.kwh),
    breakdown: {
      lighting: Number(lighting.toFixed(1)),
      hvac: Number(hvac.toFixed(1)),
      equipment: Number(equipment.toFixed(1)),
    },
  };
}

async function dashboardSnapshot() {
  const [rooms, devices, readings, alerts, activity] = await Promise.all([
    roomsWithCurrentMeetings(),
    db.select().from(devicesTable),
    db
      .select()
      .from(energyReadingsTable)
      .where(gte(energyReadingsTable.observedAt, new Date(Date.now() - 24 * 3600_000))),
    db.select().from(alertsTable).orderBy(desc(alertsTable.createdAt)).limit(6),
    db
      .select()
      .from(activitiesTable)
      .orderBy(desc(activitiesTable.createdAt))
      .limit(8),
  ]);
  const settings = await getSettings();
  const occupiedRooms = rooms.filter((room) => room.people > 0).length;
  const currentKw =
    rooms.reduce((total, room) => total + room.energyKw, 0) +
    devices
      .filter((device) => device.state === "on")
      .reduce((total, device) => total + device.watts / 1000, 0);
  const todayKwh = readings.reduce(
    (total, reading) =>
      total +
      reading.lightingKwh +
      reading.hvacKwh +
      reading.equipmentKwh,
    0,
  );
  const avgTemperature =
    rooms.length > 0
      ? rooms.reduce((sum, room) => sum + room.temperature, 0) / rooms.length
      : 22;
  const energySeries = await energyAnalytics("day");
  const peakRoomPeople = Math.max(
    1,
    rooms.reduce((sum, room) => sum + room.people, 0),
  );
  const occupancySeries = ["09", "10", "11", "12", "13", "14", "15", "16"].map(
    (label, index) => ({
      label,
      people: Math.max(
        0,
        Math.round(
          peakRoomPeople *
            ([0.46, 0.71, 0.89, 0.62, 0.53, 0.78, 0.92, 0.67][index] ?? 0.5),
        ),
      ),
    }),
  );
  return {
    employees: 128,
    occupiedRooms,
    totalRooms: rooms.length,
    availableRooms: rooms.filter(
      (room) => room.status === "available" && room.people === 0,
    ).length,
    currentKw: Number(currentKw.toFixed(1)),
    todayKwh: Number(todayKwh.toFixed(1)),
    temperature: Number(avgTemperature.toFixed(1)),
    activeDevices: devices.filter((device) => device.state === "on").length,
    savedPercent: energySeries.savedPercent,
    rooms,
    energySeries: energySeries.series,
    occupancySeries,
    alerts: alerts.map(alertDto),
    activity: activity.map(activityDto),
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const result = await dashboardSnapshot();
  res.json(GetDashboardResponse.parse(result));
});

router.get("/rooms", async (_req, res): Promise<void> => {
  const result = await roomsWithCurrentMeetings();
  res.json(GetRoomsResponse.parse(result));
});

router.patch(
  "/rooms/:roomId",
  requireOfficeRoles("admin", "facility_manager", "manager"),
  async (req, res): Promise<void> => {
  const params = UpdateRoomControlsParams.safeParse(req.params);
  const body = UpdateRoomControlsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Room controls are invalid." });
    return;
  }
  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "Choose at least one room control to update." });
    return;
  }
  const { overrideMinutes, ...controlValues } = body.data;
  const patch: Partial<typeof roomsTable.$inferInsert> = {
    ...controlValues,
    updatedAt: new Date(),
    ...(overrideMinutes
      ? {
          overrideUntil: new Date(
            Date.now() + overrideMinutes * 60_000,
          ),
        }
      : {}),
  };
  const [room] = await db
    .update(roomsTable)
    .set(patch)
    .where(eq(roomsTable.id, params.data.roomId))
    .returning();
  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  await logActivity("Manual override", `Room controls updated for ${room.name}.`);
  const result = { ...roomDto(room), currentMeeting: room.currentMeeting };
  res.json(UpdateRoomControlsResponse.parse(result));
  },
);

router.get("/devices", requireOfficeRoles("admin", "facility_manager"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({ device: devicesTable, roomName: roomsTable.name })
    .from(devicesTable)
    .innerJoin(roomsTable, eq(devicesTable.roomId, roomsTable.id))
    .orderBy(roomsTable.name, devicesTable.name);
  const result = rows.map(({ device, roomName }) => ({
    ...device,
    roomName,
    updatedAt: device.updatedAt.toISOString(),
  }));
  res.json(GetDevicesResponse.parse(result));
});

router.patch(
  "/devices/:deviceId",
  requireOfficeRoles("admin", "facility_manager"),
  async (req, res): Promise<void> => {
  const params = UpdateDeviceParams.safeParse(req.params);
  const body = UpdateDeviceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Device controls are invalid." });
    return;
  }
  const [device] = await db
    .update(devicesTable)
    .set({
      state: body.data.state,
      updatedAt: new Date(),
      overrideUntil: body.data.overrideMinutes
        ? new Date(Date.now() + body.data.overrideMinutes * 60_000)
        : null,
    })
    .where(eq(devicesTable.id, params.data.deviceId))
    .returning();
  if (!device) {
    res.status(404).json({ error: "Device not found." });
    return;
  }
  const [room] = await db
    .select({ name: roomsTable.name })
    .from(roomsTable)
    .where(eq(roomsTable.id, device.roomId));
  await logActivity("Device control", `${device.name} set to ${device.state}.`);
  res.json(
    UpdateDeviceResponse.parse({
      ...device,
      roomName: room?.name ?? "Unknown room",
      updatedAt: device.updatedAt.toISOString(),
    }),
  );
  },
);

router.get("/bookings", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ booking: bookingsTable, roomName: roomsTable.name })
    .from(bookingsTable)
    .innerJoin(roomsTable, eq(bookingsTable.roomId, roomsTable.id))
    .orderBy(bookingsTable.startsAt);
  const result = rows.map(({ booking, roomName }) => ({
    ...booking,
    roomName,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
  }));
  res.json(GetBookingsResponse.parse(result));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Booking details are invalid." });
    return;
  }
  const data = parsed.data;
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt ||
    startsAt < new Date()
  ) {
    res.status(400).json({ error: "Choose a valid future meeting time." });
    return;
  }
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.id, data.roomId));
  if (!room) {
    res.status(404).json({ error: "Meeting room not found." });
    return;
  }
  if (data.attendees > room.capacity) {
    res.status(400).json({ error: "That room does not have enough capacity." });
    return;
  }
  const [conflict] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.roomId, data.roomId),
        lt(bookingsTable.startsAt, endsAt),
        gt(bookingsTable.endsAt, startsAt),
      ),
    )
    .limit(1);
  if (conflict) {
    res.status(409).json({ error: "Room is already booked for that time." });
    return;
  }
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      id: id("booking"),
      title: data.title,
      roomId: data.roomId,
      organizer: data.organizer,
      attendees: data.attendees,
      startsAt,
      endsAt,
      equipment: data.equipment,
      status: "scheduled",
    })
    .returning();
  if (!booking) {
    res.status(500).json({ error: "Unable to save the booking." });
    return;
  }
  await logActivity("Meeting booked", `${booking.title} in ${room.name}.`);
  res.status(201).json(
    CreateBookingResponse.parse({
      ...booking,
      roomName: room.name,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
    }),
  );
});

router.delete(
  "/bookings/:bookingId",
  requireOfficeRoles("admin", "facility_manager"),
  async (req, res): Promise<void> => {
  const params = (await import("@workspace/api-zod")).CancelBookingParams.safeParse(
    req.params,
  );
  if (!params.success) {
    res.status(400).json({ error: "Booking identifier is invalid." });
    return;
  }
  const [booking] = await db
    .delete(bookingsTable)
    .where(eq(bookingsTable.id, params.data.bookingId))
    .returning();
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  await logActivity("Meeting cancelled", `${booking.title} was cancelled.`);
  res.sendStatus(204);
  },
);

router.get(
  "/energy",
  requireOfficeRoles("admin", "facility_manager", "manager"),
  async (req, res): Promise<void> => {
  const parsed = GetEnergyQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Energy period is invalid." });
    return;
  }
  const result = await energyAnalytics(parsed.data.period ?? "week");
  res.json(GetEnergyResponse.parse(result));
  },
);

router.get(
  "/alerts",
  requireOfficeRoles("admin", "facility_manager", "manager"),
  async (_req, res): Promise<void> => {
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.createdAt))
    .limit(30);
  res.json(GetAlertsResponse.parse(alerts.map(alertDto)));
});

router.patch(
  "/alerts/:alertId/acknowledge",
  requireOfficeRoles("admin", "facility_manager", "manager"),
  async (req, res): Promise<void> => {
    const params = AcknowledgeAlertParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Alert identifier is invalid." });
      return;
    }
    const [alert] = await db
      .update(alertsTable)
      .set({ acknowledged: true })
      .where(eq(alertsTable.id, params.data.alertId))
      .returning();
    if (!alert) {
      res.status(404).json({ error: "Alert not found." });
      return;
    }
    await logActivity("Alert acknowledged", alert.message);
    res.json(AcknowledgeAlertResponse.parse(alertDto(alert)));
  },
);

const rules = [
  {
    id: "vacancy-lighting",
    name: "Vacancy lighting",
    description: "Switch lights off after a room has been empty for 10 minutes.",
  },
  {
    id: "vacancy-climate",
    name: "Vacancy climate",
    description: "Set empty rooms to energy-saving HVAC mode.",
  },
  {
    id: "meeting-prep",
    name: "Meeting preparation",
    description: "Pre-condition booked rooms before meetings begin.",
  },
  {
    id: "after-hours",
    name: "After-hours shutdown",
    description: "Stand by non-essential equipment outside office hours.",
  },
];

router.get(
  "/automation",
  requireOfficeRoles("admin", "facility_manager"),
  async (_req, res): Promise<void> => {
  const settings = await getSettings();
  res.json(
    GetAutomationResponse.parse({
      enabled: settings.automationEnabled,
      simulationRunning: settings.simulationRunning,
      rules: rules.map((rule) => ({
        ...rule,
        enabled: settings.automationEnabled,
      })),
    }),
  );
});

router.patch(
  "/automation",
  requireOfficeRoles("admin", "facility_manager"),
  async (req, res): Promise<void> => {
  const parsed = UpdateAutomationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Automation setting is invalid." });
    return;
  }
  const [settings] = await db
    .update(officeSettingsTable)
    .set({
      automationEnabled: parsed.data.enabled,
      updatedAt: new Date(),
    })
    .where(eq(officeSettingsTable.id, "default"))
    .returning();
  const current = settings ?? (await getSettings());
  await logActivity(
    "Automation",
    `Automatic control ${current.automationEnabled ? "enabled" : "paused"}.`,
  );
  res.json(
    UpdateAutomationResponse.parse({
      enabled: current.automationEnabled,
      simulationRunning: current.simulationRunning,
      rules: rules.map((rule) => ({
        ...rule,
        enabled: current.automationEnabled,
      })),
    }),
  );
});

router.post(
  "/simulator/actions",
  requireOfficeRoles("admin", "facility_manager"),
  async (req, res): Promise<void> => {
  const parsed = RunSimulatorActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Simulator action is invalid." });
    return;
  }
  const { action, roomId: requestedRoomId } = parsed.data;
  const [room] = requestedRoomId
    ? await db
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.id, requestedRoomId))
        .limit(1)
    : await db.select().from(roomsTable).orderBy(roomsTable.name).limit(1);
  if (requestedRoomId && !room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  if (action === "start" || action === "stop") {
    await db
      .update(officeSettingsTable)
      .set({ simulationRunning: action === "start", updatedAt: new Date() })
      .where(eq(officeSettingsTable.id, "default"));
    await logActivity(
      "Simulator",
      `IoT simulator ${action === "start" ? "started" : "paused"}.`,
    );
  } else if (action === "reset") {
    await db
      .update(roomsTable)
      .set({
        status: "available",
        people: 0,
        lightsOn: false,
        brightness: 0,
        hvacMode: "auto",
        energyKw: 0.3,
        currentMeeting: null,
        overrideUntil: null,
        updatedAt: new Date(),
      });
    await db
      .update(devicesTable)
      .set({ state: "standby", updatedAt: new Date(), overrideUntil: null });
    await db
      .update(officeSettingsTable)
      .set({
        simulationRunning: true,
        automationEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(officeSettingsTable.id, "default"));
    await logActivity("Simulator", "Room and device state reset to demo baseline.");
  } else if (action === "occupancy" && room) {
    const nextPeople = room.people > 0 ? 0 : Math.min(3, room.capacity);
    const lightsOn = nextPeople > 0;
    await db
      .update(roomsTable)
      .set({
        people: nextPeople,
        status: nextPeople > 0 ? "occupied" : "available",
        lightsOn,
        brightness: lightsOn ? 70 : 0,
        hvacMode: nextPeople > 0 ? "comfort" : "eco",
        energyKw: nextPeople > 0 ? 1.8 : 0.25,
        updatedAt: new Date(),
      })
      .where(eq(roomsTable.id, room.id));
    await logActivity(
      "Occupancy detected",
      `${room.name} is now ${nextPeople ? "occupied" : "vacant"}.`,
    );
  } else if (action === "meeting" && room) {
    const startsAt = new Date(Date.now() + 30 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        id: id("booking"),
        title: "Product planning session",
        roomId: room.id,
        organizer: "Maya Chen",
        attendees: Math.min(6, room.capacity),
        startsAt,
        endsAt,
        equipment: ["Display", "Video conferencing"],
        status: "scheduled",
      })
      .returning();
    if (booking) {
      await logActivity("Meeting scheduled", `${booking.title} in ${room.name}.`);
    }
  } else if (action === "high-energy" && room) {
    await db
      .update(roomsTable)
      .set({
        energyKw: sql`${roomsTable.energyKw} * 1.8`,
        updatedAt: new Date(),
      })
      .where(eq(roomsTable.id, room.id));
    await db.insert(alertsTable).values({
      id: id("alert"),
      type: "High energy",
      severity: "warning",
      message: `${room.name} is drawing unusually high power.`,
      roomId: room.id,
    });
    await logActivity("Energy anomaly", `High consumption detected in ${room.name}.`);
  } else if (action === "sensor-failure" && room) {
    await db
      .update(roomsTable)
      .set({ status: "offline", updatedAt: new Date() })
      .where(eq(roomsTable.id, room.id));
    await db.insert(alertsTable).values({
      id: id("alert"),
      type: "Sensor offline",
      severity: "critical",
      message: `Room sensor in ${room.name} has stopped reporting.`,
      roomId: room.id,
    });
    await logActivity("Sensor offline", `${room.name} sensor stopped reporting.`);
  }

  res.json(RunSimulatorActionResponse.parse(await dashboardSnapshot()));
});

export async function runSimulationTick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.simulationRunning) return;
  const rooms = await db.select().from(roomsTable).orderBy(roomsTable.name);
  const now = new Date();
  let lightingKwh = 0;
  let hvacKwh = 0;
  let equipmentKwh = 0;
  let baselineKwh = 0;
  let updatedRoomId: string | null = null;
  for (const room of rooms) {
    if (room.status === "offline" || room.status === "maintenance") continue;
    const overrideActive = room.overrideUntil && room.overrideUntil > now;
    const people = Math.max(
      0,
      Math.min(room.capacity, room.people + (Math.random() < 0.08 ? (room.people ? -1 : 1) : 0)),
    );
    const lightsOn = settings.automationEnabled && !overrideActive
      ? people > 0 && room.daylight < 78
      : room.lightsOn;
    const brightness = lightsOn
      ? Math.max(30, Math.min(100, 75 - Math.round(room.daylight * 0.25)))
      : room.brightness;
    const hvacMode = settings.automationEnabled && !overrideActive
      ? people > 0
        ? "comfort"
        : "eco"
      : room.hvacMode;
    const energyKw =
      (lightsOn ? 0.42 + brightness / 260 : 0.04) +
      (hvacMode === "comfort" ? 1.05 : hvacMode === "eco" ? 0.36 : 0) +
      0.12;
    if (people !== room.people || lightsOn !== room.lightsOn) {
      updatedRoomId ??= room.id;
    }
    await db
      .update(roomsTable)
      .set({
        people,
        status: people > 0 ? "occupied" : "available",
        temperature: Number(
          Math.max(20, Math.min(26, room.temperature + (Math.random() - 0.5) * 0.18)).toFixed(1),
        ),
        humidity: Number(
          Math.max(32, Math.min(62, room.humidity + (Math.random() - 0.5) * 1.8)).toFixed(0),
        ),
        daylight: Math.max(8, Math.min(96, room.daylight + Math.round((Math.random() - 0.5) * 5))),
        lightsOn,
        brightness: lightsOn ? brightness : 0,
        hvacMode,
        energyKw: Number(energyKw.toFixed(2)),
        overrideUntil: room.overrideUntil && room.overrideUntil <= now ? null : room.overrideUntil,
        updatedAt: now,
      })
      .where(eq(roomsTable.id, room.id));
    lightingKwh += (lightsOn ? 0.55 : 0.04) / 360;
    hvacKwh += (hvacMode === "comfort" ? 0.9 : hvacMode === "eco" ? 0.35 : 0.05) / 360;
    equipmentKwh += 0.18 / 360;
    baselineKwh += (0.55 + 0.9 + 0.18) / 360;
  }
  if (rooms.length > 0) {
    await db.insert(energyReadingsTable).values({
      roomId: updatedRoomId ?? rooms[0]?.id ?? null,
      lightingKwh,
      hvacKwh,
      equipmentKwh,
      baselineKwh,
      observedAt: now,
    });
  }
  await db
    .delete(energyReadingsTable)
    .where(lt(energyReadingsTable.observedAt, new Date(Date.now() - 31 * 24 * 3600_000)));
}

export default router;

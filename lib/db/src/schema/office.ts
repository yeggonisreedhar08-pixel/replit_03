import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const roomsTable = pgTable("office_rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zone: text("zone").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("available"),
  people: integer("people").notNull().default(0),
  capacity: integer("capacity").notNull(),
  temperature: doublePrecision("temperature").notNull().default(22),
  humidity: doublePrecision("humidity").notNull().default(45),
  daylight: integer("daylight").notNull().default(50),
  lightsOn: boolean("lights_on").notNull().default(false),
  brightness: integer("brightness").notNull().default(0),
  hvacMode: text("hvac_mode").notNull().default("auto"),
  energyKw: doublePrecision("energy_kw").notNull().default(0),
  currentMeeting: text("current_meeting"),
  overrideUntil: timestamp("override_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertRoomSchema = createInsertSchema(roomsTable).omit({
  updatedAt: true,
});
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;

export const devicesTable = pgTable("office_devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roomId: text("room_id")
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  state: text("state").notNull().default("on"),
  watts: doublePrecision("watts").notNull().default(0),
  essential: boolean("essential").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  overrideUntil: timestamp("override_until", { withTimezone: true }),
});
export const insertDeviceSchema = createInsertSchema(devicesTable).omit({
  updatedAt: true,
});
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;

export const bookingsTable = pgTable("office_bookings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  roomId: text("room_id")
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  organizer: text("organizer").notNull(),
  attendees: integer("attendees").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  createdAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;

export const alertsTable = pgTable("office_alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  roomId: text("room_id").references(() => roomsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
});
export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  createdAt: true,
});
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type OfficeAlert = typeof alertsTable.$inferSelect;

export const activitiesTable = pgTable("office_activities", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  createdAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;

export const energyReadingsTable = pgTable("office_energy_readings", {
  id: serial("id").primaryKey(),
  roomId: text("room_id").references(() => roomsTable.id, {
    onDelete: "set null",
  }),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lightingKwh: doublePrecision("lighting_kwh").notNull().default(0),
  hvacKwh: doublePrecision("hvac_kwh").notNull().default(0),
  equipmentKwh: doublePrecision("equipment_kwh").notNull().default(0),
  baselineKwh: doublePrecision("baseline_kwh").notNull().default(0),
});

export const officeSettingsTable = pgTable("office_settings", {
  id: text("id").primaryKey().default("default"),
  automationEnabled: boolean("automation_enabled").notNull().default(true),
  simulationRunning: boolean("simulation_running").notNull().default(true),
  tariff: doublePrecision("tariff").notNull().default(8),
  vacancyTimeoutMinutes: integer("vacancy_timeout_minutes")
    .notNull()
    .default(10),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOfficeSettingsSchema = createInsertSchema(
  officeSettingsTable,
).omit({ updatedAt: true });
export type InsertOfficeSettings = z.infer<typeof insertOfficeSettingsSchema>;

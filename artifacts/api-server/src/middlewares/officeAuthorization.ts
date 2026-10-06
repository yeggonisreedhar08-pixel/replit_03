import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export type OfficeRole = "admin" | "facility_manager" | "manager" | "employee";

function normalizeRole(value: unknown): OfficeRole {
  if (typeof value !== "string") return "employee";
  const role = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "admin" || role === "administrator") return "admin";
  if (role === "facility_manager") return "facility_manager";
  if (role === "manager" || role === "department_manager") return "manager";
  return "employee";
}

export function requireOfficeRoles(...allowedRoles: OfficeRole[]): RequestHandler {
  return async (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to access office operations." });
      return;
    }

    try {
      const user = await clerkClient.users.getUser(userId);
      const role = normalizeRole(user.publicMetadata.role);
      if (!allowedRoles.includes(role)) {
        res.status(403).json({ error: "Your office role does not permit this action." });
        return;
      }
      next();
    } catch (error) {
      req.log.error({ err: error, userId }, "Unable to verify office role");
      res.status(503).json({ error: "Unable to verify office permissions right now." });
    }
  };
}

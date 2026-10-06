---
name: Smart Office roles
description: Role assignment and server-side authorization rules for the Smart Office app.
---

Use the verified Clerk user's `publicMetadata.role` for authorization. Canonical roles are `admin`, `facility_manager`, `manager`, and `employee`; unknown or missing roles default to `employee`. Never trust a role supplied by the browser or an arbitrary request header.

**Why:** Control and operational routes must not be exposed by client-side navigation alone.

**How to apply:** Keep server route guards and frontend role visibility aligned when adding protected Smart Office features. Elevated roles must be assigned through trusted Clerk administration.

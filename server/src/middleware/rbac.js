import sql from "../db/index.js";

export function requireWorkspaceRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const workspaceId = req.headers["x-workspace-id"] || req.query.workspace_id || req.body?.workspace_id;
    if (!workspaceId) {
      return res.status(422).json({ message: "x-workspace-id header or workspace_id param required" });
    }

    try {
      const [membership] = await sql`
        SELECT role FROM user_workspaces
        WHERE user_id = ${req.user.userId} AND workspace_id = ${workspaceId}
      `;

      if (!membership) {
        return res.status(403).json({ message: "You are not a member of this workspace" });
      }

      if (membership.role === "auditor") {
        return res.status(403).json({
          message: "Auditors have read-only access and cannot perform this action",
        });
      }

      if (!roles.includes(membership.role)) {
        return res.status(403).json({
          message: `Insufficient permissions. Required role: ${roles.join(" or ")}. Your role: ${membership.role}`,
        });
      }

      req.workspace = { id: workspaceId, role: membership.role };
      next();
    } catch (err) {
      console.error("RBAC error:", err);
      res.status(500).json({ message: "Authorization check failed" });
    }
  };
}

// Allows auditors read-only access; blocks non-auditors who don't match the required roles
export function requireWorkspaceRoleOrAuditor(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const workspaceId = req.headers["x-workspace-id"] || req.query.workspace_id || req.body?.workspace_id;
    if (!workspaceId) {
      return res.status(422).json({ message: "x-workspace-id header or workspace_id param required" });
    }

    try {
      const [membership] = await sql`
        SELECT role FROM user_workspaces
        WHERE user_id = ${req.user.userId} AND workspace_id = ${workspaceId}
      `;

      if (!membership) {
        return res.status(403).json({ message: "You are not a member of this workspace" });
      }

      // Auditors can only read
      if (membership.role === "auditor") {
        if (req.method !== "GET") {
          return res.status(403).json({ message: "Auditors have read-only access" });
        }
        req.workspace = { id: workspaceId, role: membership.role };
        return next();
      }

      // Non-auditors must match the required roles
      if (!roles.includes(membership.role)) {
        return res.status(403).json({
          message: `Insufficient permissions. Required role: ${roles.join(" or ")}. Your role: ${membership.role}`,
        });
      }

      req.workspace = { id: workspaceId, role: membership.role };
      next();
    } catch (err) {
      console.error("RBAC error:", err);
      res.status(500).json({ message: "Authorization check failed" });
    }
  };
}

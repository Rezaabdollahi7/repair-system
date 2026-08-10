const jwt = require("jsonwebtoken");
const { setContextWorkspaceId } = require("../lib/workspaceContext");
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "توکن یافت نشد" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Tokens issued before workspaceId was added to the payload are treated
    // as expired: they'd otherwise reach a handler that throws for a missing
    // workspace, surfacing as a 500 rather than a prompt to log in again.
    if (typeof payload.workspaceId !== "number") {
      return res.status(401).json({ error: "توکن نامعتبر یا منقضی شده" });
    }

    // { id, workspaceId, username, role, isActive } — workspaceId is what
    // every tenant-scoped query is filtered by, so it has to come from the
    // signed token and never from the request body or query.
    req.user = payload;

    // Also published to the async context, which is where the Prisma
    // extension reads it — req isn't reachable from inside the client.
    setContextWorkspaceId(payload.workspaceId);

    next();
  } catch (err) {
    return res.status(401).json({ error: "توکن نامعتبر یا منقضی شده" });
  }
}

module.exports = { authenticate, JWT_SECRET };

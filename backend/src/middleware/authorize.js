// سلسله‌مراتب نقش‌ها
const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  technician: 1,
};

/**
 * چک می‌کند که کاربر حداقل یکی از نقش‌های مجاز را داشته باشد
 * استفاده: authorize('admin', 'super_admin')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "احراز هویت نشده" });
    }

    if (!req.user.isActive) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "دسترسی ندارید" });
    }

    next();
  };
}

/**
 * چک می‌کند که نقش کاربر حداقل به سطح مشخص برسد
 * استفاده: atLeast('admin') → admin و super_admin رد می‌شوند
 */
function atLeast(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "احراز هویت نشده" });
    }

    if (!req.user.isActive) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < minLevel) {
      return res.status(403).json({ error: "دسترسی ندارید" });
    }

    next();
  };
}

module.exports = { authorize, atLeast, ROLE_HIERARCHY };

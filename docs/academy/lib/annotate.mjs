// کادر و شماره روی جایی که خواننده باید کلیک کند (docs/academy/writing-guide.md
// در ریپوی لندینگ: «کادر و شماره به رنگ برند»).
//
// لایه‌ای با position: fixed روی صفحه کشیده می‌شود، پس فقط برای عکس از همان
// viewport معتبر است؛ بعد از عکس با clear() پاک می‌شود.

const ORANGE = "#EE5D38"; // رنگ برند لندینگ؛ روی UI آبی اپ خوب دیده می‌شود

/**
 * @param page صفحه‌ی Playwright
 * @param marks [{ target: Locator, n?: number, pad?: number }]
 */
export async function mark(page, marks) {
  const boxes = [];
  for (const m of marks) {
    await m.target.first().scrollIntoViewIfNeeded();
    const box = await m.target.first().boundingBox();
    if (!box) throw new Error(`عنصر برای علامت ${m.n ?? ""} روی صفحه نیست`);
    boxes.push({ ...box, n: m.n, pad: m.pad ?? 6 });
  }
  await page.evaluate(
    ({ boxes, color }) => {
      const layer = document.createElement("div");
      layer.id = "academy-marks";
      layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
      for (const b of boxes) {
        const r = document.createElement("div");
        r.style.cssText = `position:absolute;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${b.width + b.pad * 2}px;height:${b.height + b.pad * 2}px;border:3px solid ${color};border-radius:12px;box-shadow:0 0 0 4px ${color}33`;
        layer.appendChild(r);
        if (b.n !== undefined) {
          const badge = document.createElement("div");
          badge.textContent = Number(b.n).toLocaleString("fa-IR");
          // گوشه‌ی بالا-چپ: در فرم‌های راست‌به‌چپ برچسب فیلد بالا-راست است و نباید پوشانده شود
          badge.style.cssText = `position:absolute;left:${b.x - b.pad - 16}px;top:${b.y - b.pad - 16}px;width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font:700 15px/30px sans-serif;text-align:center;box-shadow:0 2px 6px #0004`;
          layer.appendChild(badge);
        }
      }
      document.body.appendChild(layer);
    },
    { boxes, color: ORANGE },
  );
}

export async function clear(page) {
  await page.evaluate(() => document.getElementById("academy-marks")?.remove());
}

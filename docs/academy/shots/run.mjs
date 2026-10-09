// pnpm shots                  همه‌ی آموزش‌ها
// pnpm shots device-intake    فقط یکی
//
// هر فایل در shots/tutorials/ یک آموزش است؛ نامش همان slug آموزش در
// keyword-map.md لندینگ، و خروجی‌اش out/shots/<slug>/.

import { readdirSync } from "node:fs";
import { launch } from "../lib/session.mjs";

const dir = new URL("./tutorials/", import.meta.url);
const all = readdirSync(dir).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
const wanted = process.argv.slice(2);
const todo = wanted.length ? all.filter((t) => wanted.includes(t)) : all;
if (wanted.length && todo.length !== wanted.length) {
  console.error(`آموزش ناشناخته. موجود: ${all.join("، ")}`);
  process.exit(1);
}

const browser = await launch();
try {
  for (const name of todo) {
    console.log(name);
    const { default: run } = await import(new URL(`${name}.mjs`, dir));
    await run(browser);
  }
} finally {
  await browser.close();
}

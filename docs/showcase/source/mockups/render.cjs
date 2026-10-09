const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2 });
  for (const n of process.argv.slice(2)) {
    await p.goto("file://" + __dirname + "/" + n + ".html");
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    await p.screenshot({ path: __dirname + "/" + n + ".png" });
    console.log("rendered", n);
  }
  await b.close();
})();

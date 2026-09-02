/**
 * The nightly subscription job's entry point.
 *
 * Run inside the backend container by ops/subscription-cron.sh. A separate
 * process rather than a timer inside the API, for the same reason backups
 * are a host cron: an app broken badly enough to stop serving must not also
 * be the thing that stops warning people their subscription is ending.
 *
 * ⚠️ Exits non-zero when any workspace failed, so cron's own mail and the
 * log file both show it. The successful part of the run still happened —
 * this is a report, not a rollback.
 */
import "dotenv/config";
import prisma from "../lib/prisma";
import { runSubscriptionJob } from "../utils/subscriptionJob";

async function main() {
  const started = Date.now();
  const report = await runSubscriptionJob();

  console.log(
    `subscription job: notified=${report.notified} ` +
      `status=${report.statusUpdated} deleted=${report.deleted} ` +
      `settled=${report.settled} failures=${report.failures} ` +
      `(${Math.round((Date.now() - started) / 1000)}s)`,
  );

  if (report.failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("subscription job failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

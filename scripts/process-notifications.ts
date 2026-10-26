// Processes due notification jobs once. Run from cron, or use POST /api/jobs/notifications.
import "./env";
import { createDatabase } from "../src/server/db/connect";
import { processDueNotifications } from "../src/server/modules/notifications";

createDatabase(process.env)
  .then((db) => processDueNotifications(db, 100))
  .then((r) => {
    console.log(`Sent ${r.sent}, failed ${r.failed}.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

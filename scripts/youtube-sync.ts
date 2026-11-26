// Клипове и гледания в YouTube на ръка (същото като нощния cron /api/cron/youtube, но без лимит на времето).
// Спира при дневния лимит търсения (YOUTUBE_DAILY_SEARCHES, по подразбиране 90) или изчерпана квота.
//   npm run youtube:sync
import "./env";
import { runYoutubeSync } from "../src/lib/youtube";

const budgetArg = process.argv.find((a) => a.startsWith("--seconds="));
const seconds = budgetArg ? Number(budgetArg.slice("--seconds=".length)) : 600;

runYoutubeSync(seconds * 1000)
  .then((summary) => {
    console.log(summary);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

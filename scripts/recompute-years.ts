// Преизчислява годините на всички песни и албуми (най-ранното издание; надеждна = има ISRC година).
//   npm run catalog:years
import "./env";
import { recomputeAllYears } from "../src/lib/catalog/years-recompute";

recomputeAllYears()
  .then((summary) => {
    console.log(summary);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

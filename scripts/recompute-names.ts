// Имена за показване: кирилица, когато я имаме (src/lib/catalog/display.ts).
//   npm run catalog:names
import "./env";
import { recomputeDisplayNames } from "../src/lib/catalog/display-names";

recomputeDisplayNames()
  .then((summary) => {
    console.log(summary);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

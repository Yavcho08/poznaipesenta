// Внос на артист от Deezer.
//   npm run import:artist -- "Азис"
//   npm run import:artist -- "Азис" --id=356996        (ръчно избран профил)
//   npm run import:artist -- "Азис" --pop-folk
// При несигурно съвпадение скриптът спира и показва кандидатите — не гадае.
import "dotenv/config";
import { findArtist, importArtist, type ArtistCandidate } from "@/lib/import-artist";

function formatCandidate(c: ArtistCandidate): string {
  const bg = Math.round(c.bgScore * 100);
  return `  --id=${c.id}  ${c.name}  (фенове: ${c.fans}, албуми: ${c.albums}, бълг.: ${bg}%; напр. ${c.sample.join(", ")})  https://www.deezer.com/artist/${c.id}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args.find((a) => !a.startsWith("--"));
  const idArg = args.find((a) => a.startsWith("--id="))?.slice(5);
  const isPopFolk = args.includes("--pop-folk");
  if (!name) {
    console.error('Употреба: npm run import:artist -- "Име" [--id=DEEZER_ID] [--pop-folk]');
    process.exitCode = 1;
    return;
  }

  let deezerId: number;
  if (idArg) {
    deezerId = Number(idArg);
  } else {
    const match = await findArtist(name);
    if (match.kind === "none") {
      console.error(`Няма артист „${name}“ в Deezer.`);
      process.exitCode = 2;
      return;
    }
    if (match.kind === "uncertain") {
      console.error(`Несигурно съвпадение за „${name}“. Избери профил и пусни пак с --id:`);
      match.candidates.forEach((c) => console.error(formatCandidate(c)));
      process.exitCode = 2;
      return;
    }
    deezerId = match.candidate.id;
    console.log(`„${name}“ → ${match.candidate.name} (${match.candidate.fans} фенове)`);
    if (match.others.length > 0) {
      console.log("Пропуснати профили със същото име:");
      match.others.forEach((c) => console.log(formatCandidate(c)));
    }
  }

  const result = await importArtist(name, deezerId, {
    isPopFolk,
    genreSlugs: isPopFolk ? ["pop-folk"] : [],
  });
  console.log(`Записани песни: ${result.imported}, без preview (пропуснати): ${result.skippedNoPreview}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

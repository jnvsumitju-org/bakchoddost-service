import dotenv from "dotenv";
import { connectToDatabase, migrate } from "../config/db.js";
import { createPoem } from "../repo/poems.js";

dotenv.config();

async function main() {
  await connectToDatabase();
  await migrate();

  const samples = [
    {
      text:
        "{{userName}} aur {{friendName1}} ki yaari, sabse pyaari!\nHaso, khelo, mast raho, dosti meri yaari!",
      instructions: "Use placeholders like {{userName}} and {{friendName1}}",
    },
    {
      text:
        "Kahani dosti ki, likhi gayi dil se,\n{{userName}} ke saath {{friendName1}}, yaariyaan milke!",
      instructions: "Use {{userName}} and multiple friends like {{friendName2}}",
    },
    {
      text:
        "Chai ki chuski, gupshup ki barsaat,\n{{friendName1}} aur {{friendName2}} ke saath, yaari non-stop!",
      instructions: "Supports {{friendName1}}, {{friendName2}}, etc.",
    },
  ];

  for (const s of samples) {
    await createPoem(null, s);
  }
  // eslint-disable-next-line no-console
  // eslint-disable-next-line no-console
  console.log("Seeded poem templates.");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});



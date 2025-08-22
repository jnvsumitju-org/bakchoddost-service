import dotenv from "dotenv";
import { connectToDatabase } from "../config/db.js";
import { PoemTemplate } from "../models/PoemTemplate.js";

dotenv.config();

async function main() {
  await connectToDatabase();
  const existing = await PoemTemplate.countDocuments();
  if (existing > 0) {
    // eslint-disable-next-line no-console
    console.log(`Templates already present: ${existing}`);
    process.exit(0);
  }

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

  await PoemTemplate.insertMany(samples);
  // eslint-disable-next-line no-console
  console.log("Seeded poem templates.");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});



import dotenv from "dotenv";
import { connectToDatabase } from "./config/db.js";
import { createApp } from "./app.js";
import env from "./config/env.js";

dotenv.config();

await connectToDatabase();
const app = createApp();

const PORT = env.PORT;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});



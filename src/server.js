import dotenv from "dotenv";
import { connectToDatabase, migrate } from "./config/db.js";
import { createApp } from "./app.js";
import env from "./config/env.js";

dotenv.config();

await connectToDatabase();
await migrate();
const app = createApp();

const PORT = env.PORT;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});



import dotenv from "dotenv";
import { connectToDatabase, migrate } from "./src/config/db.js";
import { createApp } from "./src/app.js";

dotenv.config();

let app;
let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    // await connectToDatabase();
    // await migrate();
    isConnected = true;
  }

  if (!app) {
    app = createApp();
  }

  // Vercel provides req/res directly (no serverless-express needed)
  return app(req, res);
}

import serverlessExpress from "@vendia/serverless-express";
import dotenv from "dotenv";
import { connectToDatabase } from "./src/config/db.js";
import { createApp } from "./src/app.js";

dotenv.config();
let server;

async function bootstrap() {
  if (!server) {
    await connectToDatabase();
    const app = createApp();
    server = serverlessExpress({ app });
  }
  return server;
}

export const handler = async (event, context) => {
  const app = createApp();
  const srv = serverlessExpress({ app });
  return srv(event, context);
};
  
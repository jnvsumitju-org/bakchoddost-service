import serverlessExpress from "@vendia/serverless-express";
import dotenv from "dotenv";
import { connectToDatabase } from "./src/config/db.js";
import { createApp } from "./src/app.js";

dotenv.config();
let server; // cached between Lambda invocations

async function bootstrap() {
  if (!server) {
    await connectToDatabase();   // connect MongoDB once, on cold start
    const app = createApp();
    server = serverlessExpress({ app });
  }
  return server;
}

export const handler = async (event, context) => {
  const srv = await bootstrap();  // use cached app/server
  return srv(event, context);
};

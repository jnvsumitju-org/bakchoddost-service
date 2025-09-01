import mongoose from "mongoose";
import env from "./env.js";

let isConnected = false; // track the connection across invocations

export async function connectToDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  const mongoUri = env.MONGODB_URI;

  try {
    await mongoose.connect(mongoUri, {
      dbName: env.MONGODB_DB || undefined,
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log("✅ Connected to MongoDB");

    return mongoose.connection;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error; // don’t use process.exit in Lambda
  }
}

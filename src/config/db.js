import mongoose from "mongoose";

let isConnected = false; // track the connection across invocations

export async function connectToDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  const mongoUri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bakchoddost";

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || undefined,
    });

    isConnected = true;
    console.log("✅ Connected to MongoDB");

    return mongoose.connection;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error; // don’t use process.exit in Lambda
  }
}

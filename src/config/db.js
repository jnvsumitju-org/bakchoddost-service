import mongoose from "mongoose";

export async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bakchoddost";
  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || undefined,
    });
    // eslint-disable-next-line no-console
    console.log("Connected to MongoDB");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("MongoDB connection error", error);
    process.exit(1);
  }
}



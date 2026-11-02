import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env.local");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };
global.mongoose = cached;

export async function connectDB() {
  // Only trust the cached connection if the socket is actually alive (readyState 1).
  // On serverless (Vercel) the lambda freezes/thaws and Atlas drops idle sockets, so a
  // cached-but-dead connection would otherwise throw "Client must be connected" on the
  // next query — the intermittent "no data until you refresh a few times" bug.
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;

  // If a previous connect attempt is still pending, reuse it; if it settled to a dead
  // state, drop it so we can retry with a fresh promise below.
  if (cached.promise && mongoose.connection.readyState === 0) {
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        // bufferCommands ON (default): queue queries while the socket is (re)connecting
        // instead of throwing immediately — smooths cold starts and thaw reconnects.
        bufferCommands: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      })
      .then((m) => m)
      .catch((err) => {
        // Never cache a rejected promise — it would poison this whole lambda instance.
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

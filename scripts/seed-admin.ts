/**
 * Run with: npx tsx scripts/seed-admin.ts
 * Loads .env.local automatically — no extra setup needed.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Load .env.local manually (no dotenv dependency needed)
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGODB_URI = process.env.MONGODB_URI ?? "";
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI not found in .env.local");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: String,
    role: String,
    profileCompleted: { type: Boolean, default: true },
  },
  { timestamps: true }
);

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected");

  const User = mongoose.models.User || mongoose.model("User", UserSchema);

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@mediiq.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin@123";
  const hashed = await bcrypt.hash(adminPassword, 12);

  const existing = await User.findOne({ role: "admin" });
  if (existing) {
    await User.findByIdAndUpdate(existing._id, { password: hashed, email: adminEmail });
    console.log("");
    console.log("✅  Admin password updated!");
    console.log("   Email    :", adminEmail);
    console.log("   Password :", adminPassword);
  } else {
    await User.create({
      name: "Admin",
      email: adminEmail,
      password: hashed,
      role: "admin",
      profileCompleted: true,
    });
    console.log("");
    console.log("✅  Admin account created successfully!");
    console.log("   Email    :", adminEmail);
    console.log("   Password :", adminPassword);
  }
  console.log("");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(`Go to ${appUrl}/login and sign in.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});

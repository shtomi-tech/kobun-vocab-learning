import { writeFileSync } from "node:fs";

const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
};

writeFileSync("static/config.json", `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("Wrote static/config.json");

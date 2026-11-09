// Public values (the anon key is safe in the browser; row-level security protects the data).
/** Demo mode (sample personas and "Sample data" labels) is off unless DEMO_MODE=on and DEMO_PASSWORD are both set. Server only. */
export const isDemo = () => process.env.DEMO_MODE === "on" && Boolean(process.env.DEMO_PASSWORD);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://excvjpgpyriqcjnvdjuh.supabase.co";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4Y3ZqcGdweXJpcWNqbnZkanVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMjQ4ODUsImV4cCI6MjEwOTgwMDg4NX0.OJNgyRek96SD2Q_Hh5zA-db861V13ngwyM-GDILuQ-g";

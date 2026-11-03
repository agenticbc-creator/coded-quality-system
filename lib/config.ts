// Public values (the anon key is safe in the browser; row-level security protects the data).
/** Demo mode: the shared password for the sample personas is set. Remove DEMO_PASSWORD to run live. Server only. */
export const isDemo = () => Boolean(process.env.DEMO_PASSWORD);

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dceyqaobmasqibclchdg.supabase.co";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXlxYW9ibWFzcWliY2xjaGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MjQ1NjcsImV4cCI6MjEwOTEwMDU2N30.F8nk7rdn1R5uzlpKGIXYANFnPdJ0HKvkkcTTkR_3H6w";

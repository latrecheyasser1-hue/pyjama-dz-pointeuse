import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oelazwokhsdiadlpaege.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbGF6d29raHNkaWFkbHBhZWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NDQxNTUsImV4cCI6MjA5OTAyMDE1NX0.ezCLwJm52Zc_lpyby2yJMOwtjLOINfBnLaU9E1FMT28';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Helper for admin seeding if needed in development
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
export const getAdminClient = () => {
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

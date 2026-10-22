// Bo7 members area settings (used by index.html and staff.html).
//
// LIVE: paste your project's URL and anon (public) key from Supabase -> Project Settings -> API, and set demo: false.
//       The anon key is safe to publish: the database's row level security decides what each person can see.
// DEMO: leave the Supabase values empty and set demo: true. Any number and any six digits log in, and data is
//       kept in that browser only. Never publish the live site with demo: true.
// With neither set, the pages show "not available" instead of silently pretending to save.
window.BO7_CONFIG = {
  supabaseUrl: 'https://oeckpbmcunyktkeupcke.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY2twYm1jdW55a3RrZXVwY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzQzODUsImV4cCI6MjEwNzU1MDM4NX0.pOCv3FRpMshAeyQJ8CpJXXPm9z2sxMEikjpy6lWbL7o',
  demo: false,
  // Where the "Bookings" button goes (your Glofox booking link). Leave empty to hide the button.
  bookingsUrl: ''
};

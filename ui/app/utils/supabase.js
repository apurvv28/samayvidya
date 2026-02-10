
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fbbclwlvlzohkzowgddl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiYmNsd2x2bHpvaGt6b3dnZGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1Mzg2ODQsImV4cCI6MjA4NjExNDY4NH0.ax__px1BXeqjaN_p6ENmU8Gt5GLYHZlb9O4XES37ZWw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

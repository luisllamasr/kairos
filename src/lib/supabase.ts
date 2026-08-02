import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

import { createMultiAccountAuthStorage, getSupabaseAuthStorageKey } from '@/lib/auth-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAuthStorageKey = getSupabaseAuthStorageKey(supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createMultiAccountAuthStorage(supabaseAuthStorageKey),
    storageKey: supabaseAuthStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'failed' | 'network' };

/**
 * Deletes the currently signed-in user via the delete-account Edge Function.
 * Storage cleanup runs asynchronously through the existing pg_net trigger.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return { ok: false, error: 'unauthorized' };
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) {
    if (error instanceof FunctionsHttpError && error.context.status === 401) {
      return { ok: false, error: 'unauthorized' };
    }
    if (error instanceof FunctionsHttpError) {
      return { ok: false, error: 'failed' };
    }
    return { ok: false, error: 'network' };
  }

  if (data && typeof data === 'object' && 'success' in data && data.success === true) {
    return { ok: true };
  }

  return { ok: false, error: 'failed' };
}

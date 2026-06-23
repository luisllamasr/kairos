import { supabase } from '@/lib/supabase';
import { IncomingFriendRequest, PublicProfile } from '@/types/public-profile';

type RpcResult = { ok: boolean; error: boolean };

async function runFriendshipRpc(
  fn:
    | 'send_friend_request'
    | 'accept_friend_request'
    | 'decline_friend_request'
    | 'cancel_friend_request'
    | 'remove_friend',
  username: string,
): Promise<RpcResult> {
  const { error } = await supabase.rpc(fn, { p_username: username });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function sendFriendRequest(username: string): Promise<RpcResult> {
  return runFriendshipRpc('send_friend_request', username);
}

export async function acceptFriendRequest(username: string): Promise<RpcResult> {
  return runFriendshipRpc('accept_friend_request', username);
}

export async function declineFriendRequest(username: string): Promise<RpcResult> {
  return runFriendshipRpc('decline_friend_request', username);
}

export async function cancelFriendRequest(username: string): Promise<RpcResult> {
  return runFriendshipRpc('cancel_friend_request', username);
}

export async function removeFriend(username: string): Promise<RpcResult> {
  return runFriendshipRpc('remove_friend', username);
}

export async function listFriends(): Promise<{ data: PublicProfile[]; error: boolean }> {
  const { data, error } = await supabase.rpc('list_friends');

  if (error) return { data: [], error: true };
  return { data: (data ?? []) as PublicProfile[], error: false };
}

export async function listIncomingFriendRequests(): Promise<{
  data: IncomingFriendRequest[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_incoming_friend_requests');

  if (error) return { data: [], error: true };
  return { data: (data ?? []) as IncomingFriendRequest[], error: false };
}

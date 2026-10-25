// Thin route re-export — see src/components/PublicMemoryDetailScreen.tsx.
// Duplicated (unchanged) under (search)/memory/[id].tsx so this screen
// stays in whichever tab PublicProfileScreen (or a direct deep link) was
// opened from. Distinct from (profile)/memories/[id].tsx, which is the
// owner-only participant view of one's own memories.
export { PublicMemoryDetailScreen as default } from '@/components/PublicMemoryDetailScreen';

export type ExperienceStatus = 'planned' | 'cancelled';
export type ExperienceVisibility = 'private' | 'public';

export type Experience = {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  starts_at: string;
  ends_at: string;
  transform_at: string;
  visibility: ExperienceVisibility;
  status: ExperienceStatus;
  cancelled_at: string | null;
  purge_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExperienceListItem = {
  id: string;
  title: string;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  starts_at: string;
  ends_at: string;
  transform_at: string;
  status: ExperienceStatus;
  purge_at: string | null;
};

export function isExperienceUpcoming(
  experience: Pick<Experience, 'status' | 'transform_at'>,
): boolean {
  if (experience.status !== 'planned') return false;
  return new Date(experience.transform_at).getTime() > Date.now();
}

export function isExperienceEnded(
  experience: Pick<Experience, 'status' | 'transform_at'>,
): boolean {
  return experience.status === 'planned' && new Date(experience.transform_at).getTime() <= Date.now();
}

export function isExperiencePurgePending(
  experience: Pick<Experience, 'status' | 'purge_at'>,
): boolean {
  if (experience.status !== 'cancelled' || !experience.purge_at) return false;
  return new Date(experience.purge_at).getTime() > Date.now();
}

export function canRemoveExperience(experience: Experience): boolean {
  return isExperienceUpcoming(experience) || isExperiencePurgePending(experience);
}

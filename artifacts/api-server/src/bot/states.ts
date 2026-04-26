// In-memory state management for user sessions
export interface UserState {
  action?: string;
  // Manhwa add/edit flow
  draftChannelId?: string;
  draftChannelName?: string;
  draftManhwaTitle?: string;
  draftPrice?: number;
  draftCoverFileId?: string;
  draftReviewFileId?: string;
  draftDescription?: string;
  // Edit existing
  editChannelId?: string;
  // Purchase flow
  selectedManhwa?: string;
  selectedChannelId?: string;
  paymentMethod?: string;
  purchaseId?: number;
  // Main channel setup
  mainChannelLink?: string;
  // Broadcast flow
  broadcastText?: string;
  broadcastEntities?: any[];
  broadcastPhotoFileId?: string;
  broadcastButtons?: { label: string; url: string }[];
  broadcastPendingButtonLabel?: string;
}

const userStates = new Map<number, UserState>();

export function getUserState(userId: number): UserState {
  return userStates.get(userId) || {};
}

export function setUserState(userId: number, state: UserState): void {
  userStates.set(userId, state);
}

export function updateUserState(userId: number, patch: Partial<UserState>): void {
  const current = userStates.get(userId) || {};
  userStates.set(userId, { ...current, ...patch });
}

export function clearUserState(userId: number): void {
  userStates.delete(userId);
}

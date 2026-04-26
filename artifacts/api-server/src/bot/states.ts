// In-memory state management for user sessions
export interface UserState {
  action?: string;
  selectedManhwa?: string;
  selectedChannelId?: string;
  paymentMethod?: string;
  purchaseId?: number;
}

const userStates = new Map<number, UserState>();

export function getUserState(userId: number): UserState {
  return userStates.get(userId) || {};
}

export function setUserState(userId: number, state: UserState): void {
  userStates.set(userId, state);
}

export function clearUserState(userId: number): void {
  userStates.delete(userId);
}

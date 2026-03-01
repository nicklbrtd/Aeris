export type User = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio?: string | null;
  role?: 'admin' | 'user';
  email?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  createdAt?: string;
};

export type PrivacySettings = {
  profileVisibility: 'everyone' | 'contacts' | 'nobody';
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  readReceiptsEnabled: boolean;
  typingStatusEnabled: boolean;
  allowDmFrom: 'everyone' | 'members' | 'nobody';
  discoverByEmail: boolean;
  discoverByPhone: boolean;
  securityAlerts: boolean;
};

export type NotificationSettings = {
  pushEnabled: boolean;
  emailNotifications: boolean;
  marketingOptIn: boolean;
};

export type SettingsPayload = {
  user: User;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  sessionsCount: number;
  csrfToken: string;
};

export type UserSearchResult = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
};

export type ImageAsset = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  originalPath: string;
  thumbPath: string;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  createdAt: string;
  type: 'text' | 'image';
  text: string | null;
  imageId: string | null;
  sender: User;
  image?: ImageAsset | null;
  clientId?: string;
  pending?: boolean;
};

export type Chat = {
  id: string;
  type: 'dm' | 'community';
  title: string;
  avatarUrl: string | null;
  membersCount: number;
  lastMessage: {
    id: string;
    type: 'text' | 'image';
    text: string | null;
    createdAt: string;
    sender: {
      id: string;
      nickname: string;
    };
  } | null;
};

export type Community = {
  id: string;
  title: string;
  membersCount: number;
  joined: boolean;
};

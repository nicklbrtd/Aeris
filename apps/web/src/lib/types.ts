export type User = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role?: 'admin' | 'user';
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

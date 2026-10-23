export interface Note {
  id: string;
  xsecToken?: string;
  getAnalysis?: {
    jobId: string; provider: 'GET'; sourceUrl: string;
    status: 'queued'|'submitting'|'pending'|'processing'|'fetching'|'ready'|'failed'|'paused'|'unknown'|'cancelled';
    title?: string; content?: string; noteId?: string; noteUrl?: string;
    requestedAt: string; updatedAt: string; completedAt?: string;
    error?: string; canRetry?: boolean;
  };
  sourceUrl?: string;
  origin?: 'xiaohongshu' | 'douyin' | 'manual' | 'aihot';
  title: string;
  content?: string;
  rawContent?: string;
  ocrText?: string;
  coverUrl: string;
  imageUrls?: string[];
  sourceImageUrls?: string[];
  imageOcr?: Array<{
    imageUrl: string;
    text: string;
    error?: string;
  }>;
  sourceVideoUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  transcriptText?: string;
  transcriptSegments?: Array<{
    start: number;
    duration: number;
    text: string;
  }>;
  transcriptEngine?: string;
  videoStatus?: 'pending' | 'ready' | 'partial' | 'none';
  videoError?: string;
  mediaStatus?: 'pending' | 'ready' | 'partial' | 'none';
  mediaError?: string;
  author: {
    name: string;
    avatar?: string;
    userId?: string;
  };
  likes: number;
  collects: number;
  comments: number;
  category: string;
  autoGroup?: {
    assignmentId: string;
    groupId: string;
    groupName: string;
    reason: string;
    assignedAt: string;
  };
  savedAt: Date;
  tags: string[];
  type?: 'video' | 'normal';
  imageAspect?: 'tall' | 'medium' | 'short' | 'normal';
}

export interface XHSUser {
  userId: string;
  nickname: string;
  avatar: string;
  following: number;
  followers: number;
}

export interface AppState {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
}

export type AppAction =
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

import { 
  collection, 
  query, 
  where,
  orderBy, 
  limit, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface LeaderboardEntry {
  id?: string;
  userId: string;
  username: string;
  score: number;
  difficulty: string;
  timestamp: Timestamp | any;
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const COLLECTION_PATH = 'leaderboard';

export const leaderboardService = {
  async getTopScores(maxEntries: number = 10, difficulty?: string): Promise<LeaderboardEntry[]> {
    try {
      let q;
      if (difficulty && difficulty !== 'ALL') {
        q = query(
          collection(db, COLLECTION_PATH),
          where('difficulty', '==', difficulty),
          orderBy('score', 'desc'),
          limit(maxEntries)
        );
      } else {
        q = query(
          collection(db, COLLECTION_PATH),
          orderBy('score', 'desc'),
          limit(maxEntries)
        );
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data() as LeaderboardEntry;
        return {
          id: doc.id,
          userId: data.userId,
          username: data.username,
          score: data.score,
          difficulty: data.difficulty,
          timestamp: data.timestamp
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_PATH);
      return [];
    }
  },

  async addScore(username: string, score: number, difficulty: string) {
    if (!auth.currentUser) throw new Error('Must be signed in to post scores');
    
    try {
      const entry = {
        userId: auth.currentUser.uid,
        username,
        score,
        difficulty,
        timestamp: serverTimestamp()
      };
      return await addDoc(collection(db, COLLECTION_PATH), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_PATH);
    }
  }
};

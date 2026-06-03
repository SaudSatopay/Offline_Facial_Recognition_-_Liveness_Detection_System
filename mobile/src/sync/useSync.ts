// Connectivity-aware sync. Works fully offline; when the device regains a
// connection it flushes locally-queued users + attendance to the cloud server.
import { useCallback, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getSettings } from '../config';
import { postUsers, postAttendance } from './client';
import { getUnsyncedUsers, markUsersSynced } from '../db/users';
import {
  getUnsyncedAttendance, markAttendanceSynced, countUnsynced,
} from '../db/attendance';

export type SyncState = {
  online: boolean;
  syncing: boolean;
  unsynced: number;
  lastSync: number | null;
  lastError: string | null;
};

export function useSync() {
  const [state, setState] = useState<SyncState>({
    online: false, syncing: false, unsynced: 0, lastSync: null, lastError: null,
  });

  const refreshCount = useCallback(() => {
    setState((s) => ({ ...s, unsynced: countUnsynced() }));
  }, []);

  const syncNow = useCallback(async (): Promise<boolean> => {
    const { serverUrl, apiKey } = getSettings();
    setState((s) => ({ ...s, syncing: true, lastError: null }));
    try {
      const users = getUnsyncedUsers().map((u) => ({
        id: u.id, name: u.name, embedding: JSON.parse(u.embedding), created_at: u.created_at,
      }));
      const accUsers = await postUsers(serverUrl, apiKey, users);
      markUsersSynced(accUsers);

      const records = getUnsyncedAttendance();
      const accAtt = await postAttendance(serverUrl, apiKey, records);
      markAttendanceSynced(accAtt);

      setState((s) => ({
        ...s, syncing: false, unsynced: countUnsynced(), lastSync: Date.now(),
      }));
      return true;
    } catch (e: any) {
      setState((s) => ({ ...s, syncing: false, lastError: e?.message ?? 'sync failed' }));
      return false;
    }
  }, []);

  // watch connectivity; auto-sync when we come online with a backlog
  useEffect(() => {
    refreshCount();
    const unsub = NetInfo.addEventListener((st) => {
      const online = !!st.isConnected;
      setState((s) => ({ ...s, online }));
      if (online && countUnsynced() > 0) syncNow();
    });
    return () => unsub();
  }, [refreshCount, syncNow]);

  return { ...state, syncNow, refreshCount };
}

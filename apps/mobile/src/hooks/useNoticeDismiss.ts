import { useAppDispatch } from '@/hooks';
import { dismissNotice } from '@/store';
import { useCallback } from 'react';

export function useNoticeDismiss(noticeId: string) {
  const dispatch = useAppDispatch();

  const dismiss = useCallback(() => {
    dispatch(dismissNotice(noticeId));
  }, [dispatch, noticeId]);

  return { dismiss };
}

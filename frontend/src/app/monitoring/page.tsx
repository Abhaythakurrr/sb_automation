'use client';
import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import WorkspaceLayout from '@/components/WorkspaceLayout';

export default function Page() {
  const { openTab } = useWorkspaceStore();

  useEffect(() => {
    openTab('monitoring', 'Monitoring');
  }, [openTab]);

  return <WorkspaceLayout />;
}

'use client';
import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import WorkspaceLayout from '@/components/WorkspaceLayout';

export default function JobCreationPage() {
  const { openTab } = useWorkspaceStore();

  useEffect(() => {
    openTab('job-creation', 'Job Creation');
  }, [openTab]);

  return <WorkspaceLayout />;
}

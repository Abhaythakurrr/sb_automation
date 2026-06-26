'use client';
import SopView from '@/components/SopView';
import { JOB_DELETION_SOP } from '@/data/sopContent';

export default function SOPJobDeletion() {
  return <SopView sop={JOB_DELETION_SOP} />;
}

'use client';
import SopView from '@/components/SopView';
import { JOB_CREATION_SOP } from '@/data/sopContent';

export default function SOPJobCreation() {
  return <SopView sop={JOB_CREATION_SOP} />;
}

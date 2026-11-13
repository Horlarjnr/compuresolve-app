'use client';
import { useParams } from 'next/navigation';
import ComplaintDetail from '@/components/complaints/ComplaintDetail';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ComplaintDetail slug="hod" id={id} />;
}

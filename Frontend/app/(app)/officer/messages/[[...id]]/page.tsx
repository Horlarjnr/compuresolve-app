'use client';
import { useParams } from 'next/navigation';
import MessagesInbox from '@/components/messages/MessagesInbox';

export default function Page() {
  const { id } = useParams<{ id?: string[] }>();
  return <MessagesInbox slug="officer" staff={true} assigned="me" activeId={id?.[0]} />;
}

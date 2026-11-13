import { ErrorState } from '@/components/ui/States';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl">
      <ErrorState kind="notfound" notFoundTitle="Page not found" notFoundMessage="The page you're looking for doesn't exist or you don't have access to it." />
    </main>
  );
}

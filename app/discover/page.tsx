import type { Metadata } from 'next';
import DiscoverPage from './DiscoverPage';

export const metadata: Metadata = {
  title: 'Discover',
};

export default function Page() {
  return <DiscoverPage />;
}

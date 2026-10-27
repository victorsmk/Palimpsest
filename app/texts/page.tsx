import type { Metadata } from 'next';
import TextsPage from './TextsPage';

export const metadata: Metadata = {
  title: 'Your texts',
};

export default function Page() {
  return <TextsPage />;
}

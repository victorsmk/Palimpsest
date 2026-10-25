import type { Metadata } from 'next';
import AssistPage from './AssistPage';

export const metadata: Metadata = {
  title: 'Assisted',
};

export default function Page() {
  return <AssistPage />;
}

import { redirect } from 'next/navigation';

/** Software plans UI deferred — selling WhatsApp service / add-ons first. */
export default function ConsolePlansRedirectPage() {
  redirect('/console');
}

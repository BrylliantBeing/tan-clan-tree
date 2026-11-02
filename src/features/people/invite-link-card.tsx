import { useState } from 'react';

import { Button, Card, ErrorMessage, Hint } from '@/components/form';
import { ThemedText } from '@/components/themed-text';

export function InviteLinkCard({ url }: { url: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setError(null);
    } catch {
      setError('Could not copy automatically. Please select the link and copy it.');
    }
  };

  return (
    <Card>
      <ThemedText type="smallBold">Send this link to them</ThemedText>
      <ThemedText type="small" selectable>
        {url}
      </ThemedText>
      <Hint>It works once, expires in 14 days, and is only shown now, so copy it before leaving this page.</Hint>
      <ErrorMessage message={error} />
      <Button label={isCopied ? 'Copied' : 'Copy link'} variant="secondary" onPress={copyLink} />
    </Card>
  );
}

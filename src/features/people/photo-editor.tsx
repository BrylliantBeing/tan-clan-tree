import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ConfirmButton, ErrorMessage } from '@/components/form';
import { type Person } from '@/features/tree/use-tree';
import { api, errorMessage } from '@/lib/api';

import { Avatar } from './avatar';

const PHOTO_SIZE = 512;

// Crops to a centered square and shrinks it, so a phone photo of several MB uploads as a small JPEG
async function preparePhoto(asset: ImagePicker.ImagePickerAsset) {
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  context
    .crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: PHOTO_SIZE, height: PHOTO_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  // Browsers return a data URL here, while phones return only the data
  return saved.base64?.replace(/^data:[^,]*,/, '') ?? '';
}

export function PhotoEditor({ person, onChanged }: { person: Person; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled) return;
    await run(async () => {
      const data = await preparePhoto(result.assets[0]);
      await api(`/api/people/${person.id}/photo`, { method: 'PUT', body: { data } });
    });
  };

  return (
    <View style={styles.editor}>
      <Avatar person={person} size={96} />
      <View style={styles.actions}>
        <Button
          label={person.photoVersion === null ? 'Add a photo' : 'Change photo'}
          variant="secondary"
          busy={isBusy}
          onPress={choosePhoto}
        />
        {person.photoVersion !== null ? (
          <ConfirmButton
            label="Remove photo"
            confirmLabel="Remove this photo"
            busy={isBusy}
            onConfirm={() => run(() => api(`/api/people/${person.id}/photo`, { method: 'DELETE' }))}
          />
        ) : null}
        <ErrorMessage message={error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actions: {
    flex: 1,
    gap: 8,
  },
});

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

function receiptsDir(): Directory {
  const dir = new Directory(Paths.document, 'receipts');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Take or choose a photo and copy it into the app's documents so it survives cache clean-up. */
export async function pickReceiptPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo'} access in Settings to attach receipts.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  try {
    const src = new File(result.assets[0].uri);
    const ext = (result.assets[0].uri.split('.').pop() || 'jpg').split('?')[0].slice(0, 5);
    const dest = new File(receiptsDir(), `receipt-${Date.now()}.${ext}`);
    src.copySync(dest);
    return dest.uri;
  } catch (e) {
    Alert.alert('Could not save photo', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function deletePhotoFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Missing files are fine.
  }
}

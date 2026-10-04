import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const TYPES = {
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
  json: { mimeType: 'application/json', UTI: 'public.json' },
} as const;

/** Write text to a temporary file and open the iOS share sheet (Save to Files, Mail, AirDrop…). */
export async function shareTextFile(fileName: string, content: string, kind: keyof typeof TYPES): Promise<void> {
  try {
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing unavailable', `Saved to ${file.uri}`);
      return;
    }
    await Sharing.shareAsync(file.uri, { ...TYPES[kind], dialogTitle: fileName });
  } catch (e) {
    Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
  }
}

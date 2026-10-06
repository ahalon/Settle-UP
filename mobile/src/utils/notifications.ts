import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Ustawienie zachowania powiadomienia, gdy apka jest na pierwszym planie
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Powiadomienia push działają tylko na fizycznym telefonie
  if (!Device.isDevice) {
    console.log('[Push] Powiadomienia działają tylko na fizycznym urządzeniu');
    return null;
  }

  // Weryfikacja i prośba o uprawnienia
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Użytkownik nie przyznał uprawnień do powiadomień');
    return null;
  }

  // Wymagany kanał powiadomień dla Androida
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Powiadomienia główne',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    });
  }

  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    return pushTokenData.data;
  } catch (error) {
    console.error('[Push] Błąd pobierania tokena Expo:', error);
    return null;
  }
}
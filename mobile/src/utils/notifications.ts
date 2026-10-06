import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const isExpoGoAndroid =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
  Platform.OS === 'android';

let Notifications: any = null;
let Device: any = null;

if (!isExpoGoAndroid) {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('[Push] Błąd ładowania expo-notifications:', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (isExpoGoAndroid) {
    console.log('[Push] Wyłączone w Expo Go na Androidzie (wymóg SDK 53+).');
    return null;
  }

  if (!Device || !Device.isDevice) {
    console.log('[Push] Powiadomienia działają tylko na fizycznym urządzeniu');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Brak uprawnień do powiadomień');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Powiadomienia główne',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
      });
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    return pushTokenData.data;
  } catch (error) {
    console.error('[Push] Błąd pobierania tokena Expo:', error);
    return null;
  }
}
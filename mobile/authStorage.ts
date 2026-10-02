import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'user_access_token';
const USER_DATA_KEY = 'user_info';

export const saveToken = async (token: string): Promise<void> => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const removeToken = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_DATA_KEY);
};

export const saveUserData = async (userData: { id: number; name: string }): Promise<void> => {
  await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(userData));
};

export const getUserData = async (): Promise<{ id: number; name: string } | null> => {
  const data = await SecureStore.getItemAsync(USER_DATA_KEY);
  return data ? JSON.parse(data) : null;
};
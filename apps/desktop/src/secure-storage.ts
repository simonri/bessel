import { safeStorage } from "electron";

export async function isRealEncryptionAvailable(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  // getSelectedStorageBackend() only exists on Linux (it reports which keyring
  // was picked — kwallet, gnome-libsecret, or "basic_text", which is plaintext
  // obfuscation rather than real encryption). Calling it on mac/Windows throws
  // a TypeError, since isAsyncEncryptionAvailable() already guarantees a real OS
  // keychain/DPAPI backend there.
  if (process.platform !== "linux") return true;
  return safeStorage.getSelectedStorageBackend() !== "basic_text";
}

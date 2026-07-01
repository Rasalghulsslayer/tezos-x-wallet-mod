/**
 * KeychainUnlockSecret: the second storage layer (mobile-only — NOT a core port).
 *
 * The vault blob is encrypted and lives in MMKV; the unlock secret (the vault
 * password) is sealed here in the OS keystore behind biometrics. Unlock flow:
 * biometric prompt → the keystore releases the password → keyring.unlock(password)
 * → vault-crypto decrypts the MMKV blob. The sealed item is bound to the device,
 * never synced to iCloud, and invalidated by the OS if the biometric enrolment
 * changes (BIOMETRY_CURRENT_SET) — at which point the caller falls back to manual
 * password entry.
 */

import * as Keychain from 'react-native-keychain';

const SERVICE  = 'com.tezosx.walletmobile.unlock';
const USERNAME = 'vault';

export interface UnlockSecretStore {
  /** Biometric hardware enrolled and usable on this device. */
  isBiometryAvailable(): Promise<boolean>;
  /** A secret has been sealed (without prompting the user). */
  hasSecret(): Promise<boolean>;
  /** Seal the password behind biometrics. */
  seal(password: string): Promise<void>;
  /** Prompt biometrics and return the password, or null if unavailable/cancelled/invalidated. */
  retrieve(promptTitle: string): Promise<string | null>;
  /**
   * Prompt biometrics purely to confirm the user is present (e.g. before signing).
   * Returns true only if the OS released the sealed item — i.e. the biometric
   * check passed. Never exposes the password to the caller. Fails closed
   * (returns false) if biometrics are unavailable, cancelled, or no secret is
   * sealed, so a caller can require a positive confirmation before signing.
   */
  confirmBiometric(promptTitle: string): Promise<boolean>;
  /** Remove the sealed secret. */
  clear(): Promise<void>;
}

export class KeychainUnlockSecret implements UnlockSecretStore {
  async isBiometryAvailable(): Promise<boolean> {
    return (await Keychain.getSupportedBiometryType()) != null;
  }

  async hasSecret(): Promise<boolean> {
    return Keychain.hasGenericPassword({ service: SERVICE });
  }

  async seal(password: string): Promise<void> {
    await Keychain.setGenericPassword(USERNAME, password, {
      service:       SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible:    Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    });
  }

  async retrieve(promptTitle: string): Promise<string | null> {
    try {
      const creds = await Keychain.getGenericPassword({
        service:              SERVICE,
        authenticationPrompt: { title: promptTitle },
      });
      return creds === false ? null : creds.password;
    } catch {
      // Cancelled, no hardware, or secret invalidated by a biometric change.
      return null;
    }
  }

  async confirmBiometric(promptTitle: string): Promise<boolean> {
    try {
      // Accessing the biometry-gated item forces a Face ID / Touch ID prompt;
      // we only care that it succeeded, and discard the released password.
      const creds = await Keychain.getGenericPassword({
        service:              SERVICE,
        authenticationPrompt: { title: promptTitle },
      });
      return creds !== false;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE });
  }
}

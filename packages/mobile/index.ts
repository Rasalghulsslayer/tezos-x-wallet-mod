// Polyfills must load before any core/Taquito/WalletConnect code. Order matters:
// 0) react-native-compat MUST be the very first import. It installs the RN
//    globals WalletConnect/WalletKit need before any of their modules are
//    required — crypto.getRandomValues, TextEncoder/Decoder, URL, Buffer,
//    btoa/atob, Linking/Platform/NetInfo/Application. It internally imports the
//    same react-native-get-random-values and buffer packages we use below, with
//    the same existence guards, so the two lines that follow become idempotent
//    no-ops once it has run — kept as explicit, self-documenting safeguards for
//    the core/Taquito paths, independent of the compat shim's internals.
import '@walletconnect/react-native-compat';
// 1) secure RNG — patches global crypto.getRandomValues, which NobleCryptoPort
//    uses for the salt/IV at vault encryption (import) and key generation;
// 2) Buffer — Taquito's signer and the seed derivation expect it, Hermes lacks it.
import 'react-native-get-random-values';
import '@tezosx/wallet-core/shared/buffer-shim';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

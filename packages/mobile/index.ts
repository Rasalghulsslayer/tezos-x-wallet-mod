// Polyfill globalThis.Buffer before anything else — Taquito's signer and the
// seed derivation expect it, and Hermes does not provide it. (Secure RNG via
// react-native-get-random-values is only needed once we add key generation /
// encryption; the smoke check's decrypt + derive paths don't touch it.)
import '@tezosx/wallet-core/shared/buffer-shim';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

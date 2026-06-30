// Polyfills must load before any core/Taquito code. Order matters:
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

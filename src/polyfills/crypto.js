// Browser shim for Node's 'crypto' module.
// beacon-ui does `import "crypto"` as a side-effect; this satisfies that
// import using the Web Crypto API that is available in all modern browsers.
const webCrypto = globalThis.crypto;
export default webCrypto;
export const getRandomValues = (buf) => webCrypto.getRandomValues(buf);
export const subtle = webCrypto.subtle;
export const randomUUID = () => webCrypto.randomUUID();

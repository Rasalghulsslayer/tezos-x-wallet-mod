(function () {
  const logEl = document.getElementById('log');
  function log(label, data) {
    logEl.textContent += `${label}: ${JSON.stringify(data)}\n`;
  }

  function callEthereum(method, params) {
    if (!window.ethereum) throw new Error('window.ethereum is not injected');
    return window.ethereum.request({ method, params });
  }

  window.dapp = {
    async connect() {
      try {
        const r = await callEthereum('eth_requestAccounts');
        log('eth_requestAccounts', r);
        return { ok: true, result: r };
      } catch (e) {
        const code = (e && typeof e.code === 'number') ? e.code : null;
        const message = e && e.message ? String(e.message) : String(e);
        log('eth_requestAccounts:error', { code, message });
        return { ok: false, code, message };
      }
    },

    async accounts() {
      try {
        const r = await callEthereum('eth_accounts');
        log('eth_accounts', r);
        return { ok: true, result: r };
      } catch (e) {
        return { ok: false, message: String(e && e.message ? e.message : e) };
      }
    },

    async sendTx(args) {
      try {
        const r = await callEthereum('eth_sendTransaction', [args]);
        log('eth_sendTransaction', r);
        return { ok: true, result: r };
      } catch (e) {
        const code = (e && typeof e.code === 'number') ? e.code : null;
        return { ok: false, code, message: String(e && e.message ? e.message : e) };
      }
    },

    async signMsg(message, address) {
      try {
        const r = await callEthereum('personal_sign', [message, address]);
        log('personal_sign', r);
        return { ok: true, result: r };
      } catch (e) {
        const code = (e && typeof e.code === 'number') ? e.code : null;
        return { ok: false, code, message: String(e && e.message ? e.message : e) };
      }
    },
  };
})();

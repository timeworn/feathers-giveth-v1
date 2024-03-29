const logger = require('winston');
const balanceMonitor = require('./balanceMonitor');
const failedTxMonitor = require('./failedTxMonitor');
const pledgeNormalizer = require('./normalizer');
const eventWatcher = require('./watcher');
const { getWeb3, getHomeWeb3 } = require('./lib/web3Helpers');

let { START_WATCHERS = true } = process.env;
if (typeof START_WATCHERS === 'string' && START_WATCHERS.toLowerCase() === 'false') {
  START_WATCHERS = false;
}

module.exports = function init() {
  const app = this;

  const web3 = getWeb3(app);
  const homeWeb3 = getHomeWeb3(app);

  let web3IsConnected = false;
  let homeWeb3IsConnected = false;

  app.getWeb3 = getWeb3.bind(null, app);
  app.getHomeWeb3 = getHomeWeb3.bind(null, app);

  if (!START_WATCHERS) return;

  logger.info('starting blockchain watchers');

  const balMonitor = balanceMonitor(app);
  balMonitor.start();

  const normalizer = pledgeNormalizer(app);
  normalizer.start();

  const watcher = eventWatcher(app);
  watcher.start();

  const txMonitor = failedTxMonitor(app, watcher);
  txMonitor.start();

  web3.on(web3.DISCONNECT_EVENT, () => {
    web3IsConnected = false;
    txMonitor.close();
    watcher.close();
  });

  homeWeb3.on(homeWeb3.DISCONNECT_EVENT, () => {
    homeWeb3IsConnected = false;
    txMonitor.close();
    watcher.close();
  });

  web3.on(web3.RECONNECT_EVENT, () => {
    // web3.setProvider will clear any existing subscriptions, so we need to re-subscribe
    web3IsConnected = true;
    if (homeWeb3IsConnected) {
      txMonitor.start();
      watcher.start();
    }
  });

  homeWeb3.on(homeWeb3.RECONNECT_EVENT, () => {
    // web3.setProvider will clear any existing subscriptions, so we need to re-subscribe
    homeWeb3IsConnected = true;
    if (web3IsConnected) {
      txMonitor.start();
      watcher.start();
    }
  });
};

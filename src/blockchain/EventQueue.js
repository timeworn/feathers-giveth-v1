import logger from 'winston';

const has = Object.prototype.hasOwnProperty;

class EventQueue {
  constructor() {
    this.queue = {};
    this.processing = {};

    // for debugging purposes. check if there are any stuck txs every 5 mins
    setInterval(() => {
      if (Object.keys(this.queue).length > 0) {
        logger.info('current QUEUE status ->', JSON.stringify(this.queue, null, 2));
      }
    }, 1000 * 60 * 5);
  }

  isProcessing(txHash) {
    return this.processing[txHash] || false;
  }

  startProcessing(txHash) {
    this.processing[txHash] = true;
  }

  finishedProcessing(txHash) {
    delete this.processing[txHash];
  }

  add(txHash, fn) {
    logger.debug('adding to queue ->', txHash);

    if (this.queue[txHash]) {
      this.queue[txHash].push(fn);
    } else {
      this.queue[txHash] = [fn];
    }
  }

  purge(txHash) {
    if (!this.queue[txHash]) return Promise.resolve();

    const queued = this.queue[txHash];

    if (queued.length > 0) {
      logger.debug('purging queue ->', txHash);
      let result = queued.splice(0, 1)[0](); // remove first function from list and run it

      if (!has.call(result, 'then')) {
        result = Promise.resolve(result);
      }

      return result.then(() => {
        logger.debug('returned from purge');
        if (this.queue[txHash] && this.queue[txHash].length === 0) {
          delete this.queue[txHash];
        }
      });
    }

    return Promise.resolve();
  }
}

export default EventQueue;

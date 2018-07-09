/* eslint-disable consistent-return */

const logger = require('winston');
const ReprocessError = require('./lib/ReprocessError');
const { status: DACStatus } = require('../models/dacs.model');
const reprocess = require('../utils/reprocess');

const delegates = (app, liquidPledging) => {
  const web3 = app.getWeb3();
  const dacs = app.service('/dacs');

  async function getOrCreateDac(delegate, txHash, retry) {
    const data = await dacs.find({ paginate: false, query: { txHash } });
    if (data.length === 0) {
      // this is really only useful when instant mining. Other then that, the dac should always be
      // created before the tx was mined.
      if (!retry) throw new ReprocessError();

      const tx = await web3.eth.getTransaction(txHash);
      try {
        return dacs.create({
          ownerAddress: tx.from,
          pluginAddress: delegate.plugin,
          title: delegate.name,
          totalDonated: '0',
          donationCount: 0,
          description: '',
        });
      } catch (err) {
        // dacs service will throw BadRequest error if owner isn't whitelisted
        if (err.name === 'BadRequest') return;

        throw err;
      }
    }

    if (data.length > 1) {
      logger.info('more then 1 dac with the same ownerAddress and title found: ', data);
    }

    return data[0];
  }

  async function addDelegate(delegateId, txHash, retry) {
    try {
      const delegate = await liquidPledging.getPledgeAdmin(delegateId);
      const dac = await getOrCreateDac(delegate, txHash, retry);

      // most likely b/c the whitelist check failed
      if (!dac) return;

      return dacs.patch(dac._id, {
        delegateId,
        pluginAddress: delegate.plugin,
        status: DACStatus.ACTIVE,
      });
    } catch (err) {
      if (!(err instanceof ReprocessError)) {
        logger.error(err);
        return;
      }
      return reprocess(addDelegate.bind(delegateId, txHash, true), 5000);
    }
  }

  async function getDacById(delegateId) {
    const data = await dacs.find({ paginate: false, query: { delegateId } });
    if (data.length === 0) {
      return addDelegate(delegateId);
    }

    if (data.length > 1) {
      logger.warn('more then 1 dac with the same delegateId found: ', data);
    }

    return data[0];
  }

  return {
    /**
     * handle `DelegateAdded` events
     *
     * @param {object} event Web3 event object
     * @returns {object|undefined} delegate
     */
    addDelegate(event) {
      if (event.event !== 'DelegateAdded') {
        throw new Error('addDelegate only handles DelegateAdded events');
      }

      return addDelegate(event.returnValues.idDelegate, event.transactionHash);
    },

    /**
     * handle `DelegateUpdated` events
     *
     * @param {object} event Web3 event object
     * @returns {object} delegate
     */
    async updateDelegate(event) {
      if (event.event !== 'DelegateUpdated') {
        throw new Error('updateDelegate only handles DelegateUpdated events');
      }

      const delegateId = event.returnValues.idDelegate;

      try {
        const [dac, delegate] = await Promise.all([
          getDacById(delegateId),
          liquidPledging.getPledgeAdmin(delegateId),
        ]);
        return dacs.patch(dac._id, {
          title: delegate.name,
        });
      } catch (err) {
        logger.error('updateDelegate error ->', err);
      }
    },
  };
};

module.export = delegates;

const BigNumber = require('bignumber.js');
const errors = require('@feathersjs/errors');
const { utils } = require('web3');
const logger = require('winston');
const { MilestoneTypes } = require('../../models/milestones.model');
const { getTokenBySymbol } = require('../../utils/tokenHelper');

BigNumber.config({ DECIMAL_PLACES: 18 });

/** *
 * This function checks that the maxAmount in the milestone is based on the correct conversion rate of the milestone date
 * */
const checkConversionRates = () => context => {
  // abort check for internal calls
  if (!context.params.provider) return context;

  const { data, app } = context;
  const { items } = data;

  const fromSymbol = data.token.rateEqSymbol || data.token.symbol;
  const selectedFiatToken = getTokenBySymbol(data.selectedFiatType);
  const selectedFiatSymbol = selectedFiatToken.rateEqSymbol || selectedFiatToken.symbol;

  // skip check if the milestone has been already created
  // FIXME: Even single expense should be stored in data.items. Unnecessary duplicity in code on both frontend and feathers.
  if (
    (!items || (Array.isArray(items) && items.length === 0)) &&
    !data.fiatAmount &&
    !data.maxAmount &&
    !selectedFiatSymbol
  ) {
    return context;
  }

  // BridgedMilestone & LPMilestone may not have a maxAmount set
  if ([MilestoneTypes.BridgedMilestone, MilestoneTypes.LPMilestone].includes(data.type)) {
    if ((!items || items.length === 0) && !data.maxAmount) return context;
  }

  const calculateCorrectEther = (conversionRate, fiatAmount, etherToCheck, selectedFiatType) => {
    logger.debug(
      'calculating correct ether conversion',
      conversionRate.rates[selectedFiatType],
      fiatAmount,
      etherToCheck,
    );
    // calculate the conversion of the item, make sure that fiat-eth is correct
    const rate = conversionRate.rates[selectedFiatType];
    let ether = '';
    if (fiatAmount) {
      ether = utils.toWei(new BigNumber(fiatAmount).div(rate).toFixed(18));
    }
    if (ether !== etherToCheck) {
      throw new errors.Forbidden('Conversion rate is incorrect');
    }
  };

  if (items && items.length > 0) {
    // check total amount of milestone, make sure it is correct
    const totalItemWeiAmount = items
      .reduce((sum, item) => sum.plus(new BigNumber(item.wei)), new BigNumber('0'))
      .toString();

    if (totalItemWeiAmount !== data.maxAmount) {
      throw new errors.Forbidden('Total amount in ether is incorrect');
    }

    // now check that the conversion rate for each milestone is correct
    const promises = items.map(item =>
      app
        .service('conversionRates')
        .find({ query: { date: item.date, symbol: fromSymbol } })
        .then(conversionRate => {
          calculateCorrectEther(conversionRate, item.fiatAmount, item.wei, item.selectedFiatType);
        }),
    );

    return Promise.all(promises).then(() => context);
  }
  // check that the conversion rate for the milestone is correct
  return app
    .service('conversionRates')
    .find({ query: { date: data.date, symbol: fromSymbol } })
    .then(conversionRate => {
      calculateCorrectEther(conversionRate, data.fiatAmount, data.maxAmount, selectedFiatSymbol);
      return context;
    });
};

module.exports = checkConversionRates;

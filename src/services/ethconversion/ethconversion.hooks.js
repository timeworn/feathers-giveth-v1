import onlyInternal from '../../hooks/onlyInternal';
import { getEthConversion } from './getEthConversionService';

const getConversionRates = () => (context) => {
  const { app, params } = context;

  // block internal calls
  if (!params.provider) return context

  return getEthConversion(app, params.query.date)
    .then((res) => {
      context.result = res;
      return context;
    })
}


module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [onlyInternal()],
    update: [onlyInternal()],
    patch: [onlyInternal()],
    remove: [onlyInternal()]
  },

  after: {
    all: [],
    find: [getConversionRates()],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};

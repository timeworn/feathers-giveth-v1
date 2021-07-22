const commons = require('feathers-hooks-common');
const errors = require('@feathersjs/errors');
const { ANY_TOKEN } = require('../blockchain/lib/web3Helpers');
const { getTokenBySymbol } = require('../utils/tokenHelper');

const checkToken = context => {
  const items = commons.getItems(context);

  const inWhitelist = project => {
    if (project.token.address === ANY_TOKEN.address) return;
    if (getTokenBySymbol(project.token.symbol)) return;

    throw new errors.BadRequest(`token ${project.token.symbol} is not in the whitelist`);
  };

  if (Array.isArray(items)) {
    items.forEach(inWhitelist);
  } else {
    inWhitelist(items);
  }
  return context;
};

module.exports = {
  isTokenAllowed: () => context => checkToken(context),
};

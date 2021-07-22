const Web3 = require('web3');
const { LiquidPledging } = require('giveth-liquidpledging');

const foreignWeb3 = new Web3('https://rinkeby2.giveth.io');

/**
  Utility method to get a single pledge from liquidPledging

  Usage: node getPledge [pledgeId]
* */

async function getPledge(pledgeId) {
  const liquidPledging = new LiquidPledging(
    foreignWeb3,
    '0x8eB047585ABeD935a73ba4b9525213F126A0c979',
  );

  const pledge = await liquidPledging.getPledge(pledgeId);
  console.log('pledge', pledge);
}

getPledge(process.argv[2]);

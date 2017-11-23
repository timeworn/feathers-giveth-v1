const Web3 = require('web3');
const { LiquidPledging, Vault } = require('liquidpledging');
const { LPPDacFactory, LPPDacRuntimeByteCode } = require('lpp-dac');
const { LPPCampaignFactory, LPPCampaignRuntimeByteCode } = require('lpp-campaign');
const { LPPMilestoneFactory, LPPMilestoneRuntimeByteCode } = require('lpp-milestone');

const web3 = new Web3('ws://localhost:8546');

async function deploy() {
  const vault = await Vault.new(web3);
  const liquidPledging = await LiquidPledging.new(web3, vault.$address);
  await vault.setLiquidPledging(liquidPledging.$address);

  const dacFactory = await LPPDacFactory.new(web3);
  const campaignFactory = await LPPCampaignFactory.new(web3);
  const milestoneFactory = await LPPMilestoneFactory.new(web3);

  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPDacRuntimeByteCode));
  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPCampaignRuntimeByteCode));
  await liquidPledging.addValidPlugin(web3.utils.keccak256(LPPMilestoneRuntimeByteCode));

  console.log('vault Address: ', vault.$address);
  console.log('liquidPledging Address: ', liquidPledging.$address);
  console.log('LPPDacFactory Address: ', dacFactory.$address);
  console.log('LPPCampaignFactory Address: ', campaignFactory.$address);
  console.log('LPPMilestoneFactory Address: ', milestoneFactory.$address);
  process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
}

deploy();

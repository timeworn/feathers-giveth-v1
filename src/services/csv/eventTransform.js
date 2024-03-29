const logger = require('winston');
const BigNumber = require('bignumber.js');
const Stream = require('stream');
const Web3 = require('web3');

const { getTransaction } = require('../../blockchain/lib/web3Helpers');
const { AdminTypes } = require('../../models/pledgeAdmins.model');
const { DonationStatus } = require('../../models/donations.model');
const utils = require('./utils');
const { TraceTypes } = require('../../models/traces.model');

const capitalizeAdminType = type => {
  return type.charAt(0).toUpperCase() + type.slice(1);
};

module.exports = app => {
  const { tokenKey, TokenKeyType } = utils;
  const {
    getHomeEtherscanLink,
    getEntityLink,
    getEtherscanLink,
    getUser,
    donationDelegateStatus,
  } = utils.factory(app);

  const tokenWhiteList = app.get('tokenWhitelist');

  const donationService = app.service('donations');
  const communityService = app.service('communities');
  const traceService = app.service('traces');

  const newEventTransform = ({ campaign, traces, pledgeIds }) => {
    const campaignId = campaign._id.toString();
    const campaignBalance = {
      campaignCommitted: {},
      tracesCommitted: {},
    };
    const tracesBalance = {};
    const traceMap = new Map();
    traces.forEach(trace => {
      const { projectId, migratedProjectId } = trace;
      const key = migratedProjectId || projectId;
      traceMap.set(key, trace);
    });

    const initializeTraceBalance = trace => {
      const { _id, maxAmount, token } = trace;
      const { symbol } = token;
      const balance = {};
      if (symbol === 'ANY_TOKEN') {
        tokenWhiteList.forEach(t => {
          balance[t.symbol] = {
            [TokenKeyType.HOLD]: new BigNumber(0),
            [TokenKeyType.PAID]: new BigNumber(0),
          };
        });
      } else {
        balance[symbol] = {
          [TokenKeyType.HOLD]: new BigNumber(0),
          [TokenKeyType.PAID]: new BigNumber(0),
        };
        if (maxAmount) balance[symbol][TokenKeyType.REQUESTED] = new BigNumber(maxAmount);
      }

      tracesBalance[_id.toString()] = balance;
      return balance;
    };

    const insertCampaignBalanceItems = result => {
      const { campaignCommitted, tracesCommitted } = campaignBalance;
      Object.keys(campaignCommitted).forEach(symbol => {
        result[tokenKey(symbol, 'campaign', TokenKeyType.BALANCE)] = Web3.utils.fromWei(
          campaignCommitted[symbol].toFixed(),
        );
      });
      Object.keys(tracesCommitted).forEach(symbol => {
        result[tokenKey(symbol, 'traces', TokenKeyType.BALANCE)] = Web3.utils.fromWei(
          tracesCommitted[symbol].toFixed(),
        );
      });
    };

    // Get trace balance items
    const insertTraceBalanceItems = (id, result, bridgeInfo) => {
      const balance = tracesBalance[id.toString()];
      Object.keys(balance).forEach(symbol => {
        const tokenBalance = balance[symbol];
        [TokenKeyType.REQUESTED, TokenKeyType.HOLD, TokenKeyType.PAID].forEach(type => {
          const value = tokenBalance[type];
          if (value) {
            const key = tokenKey(symbol, AdminTypes.TRACE, type);
            result[key] = Web3.utils.fromWei(value.toFixed());
          } else if (type === TokenKeyType.REQUESTED) {
            const key = tokenKey(symbol, AdminTypes.TRACE, type);
            result[key] = 'Uncapped';
          }
        });
        const transactionTimeKey = `${symbol}-bridgePaymentExecutedTime`;
        const transactionLinkKey = `${symbol}-bridgeTransactionLink`;
        result[transactionTimeKey] = bridgeInfo && bridgeInfo[transactionTimeKey];
        result[transactionLinkKey] = bridgeInfo && bridgeInfo[transactionLinkKey];
      });
    };

    let campaignOwner;

    const updateBalance = async ({
      donation,
      isDelegate = false,
      parentId,
      revertedFrom = undefined,
    }) => {
      const { ownerType, ownerTypeId, amount, token, status } = donation;

      let balanceChange;
      let updateCampaignCommitted = false;
      if (ownerTypeId === campaignId) {
        balanceChange = new BigNumber(amount.toString());
        updateCampaignCommitted = true;
      } else if ((isDelegate && parentId === campaignId) || revertedFrom === campaignId) {
        balanceChange = new BigNumber(amount.toString()).negated();
        updateCampaignCommitted = true;
      }

      const { symbol } = token;
      if (updateCampaignCommitted) {
        const { campaignCommitted } = campaignBalance;
        const currentCampaignCommitted = campaignCommitted[symbol];
        if (!currentCampaignCommitted) {
          campaignCommitted[symbol] = balanceChange;
        } else {
          campaignCommitted[symbol] = currentCampaignCommitted.plus(balanceChange);
        }
      }

      let updateTraceCommitted = false;
      if (ownerType === AdminTypes.TRACE) {
        updateTraceCommitted = true;
        // In case trace balance is not initialized (ProjectAdded event is not processed well! gh giveth/feathers-giveth#437
        if (!tracesBalance[ownerTypeId]) {
          const [trace] = await traceService.find({
            query: {
              _id: ownerTypeId,
              $select: ['maxAmount', 'token'],
            },
            paginate: false,
          });
          initializeTraceBalance(trace);
        }
        const balance = tracesBalance[ownerTypeId];
        if (status === DonationStatus.PAID) {
          balance[symbol][TokenKeyType.HOLD] = balance[symbol][TokenKeyType.HOLD].minus(amount);
          balance[symbol][TokenKeyType.PAID] = balance[symbol][TokenKeyType.PAID].plus(amount);
          balanceChange = new BigNumber(amount.toString()).negated();
        } else {
          balance[symbol][TokenKeyType.HOLD] = balance[symbol][TokenKeyType.HOLD].plus(amount);
          balanceChange = new BigNumber(amount.toString());
        }
      }

      // Money reverted from trace
      if (tracesBalance[revertedFrom]) {
        updateTraceCommitted = true;
        const balance = tracesBalance[revertedFrom];
        balance[symbol][TokenKeyType.HOLD] = balance[symbol][TokenKeyType.HOLD].minus(amount);
        balanceChange = new BigNumber(amount.toString()).negated();
      }

      if (updateTraceCommitted) {
        const { tracesCommitted } = campaignBalance;
        const currentTracesCommitted = tracesCommitted[symbol];
        if (!currentTracesCommitted) {
          tracesCommitted[symbol] = balanceChange;
        } else {
          tracesCommitted[symbol] = currentTracesCommitted.plus(balanceChange);
        }
      }
    };

    let payouts = {};

    const flushPayouts = async stream => {
      const { transactionHash } = payouts;
      // Do nothing if payouts is empty
      if (transactionHash) {
        const { ownerEntity, actionTakerAddress, commitTime } = payouts;
        const { title, _id, pluginAddress, recipientAddress } = ownerEntity;
        const recipient = (await getUser(recipientAddress)) || {};
        const actionTaker = await getUser(actionTakerAddress);
        recipient.address = recipientAddress;
        const result = {
          createdAt: commitTime.toString(),
          action: 'Trace Paid Out',
          actor: actionTaker && actionTaker.name ? actionTaker.name : actionTakerAddress,
          actionOnBehalfOf: title,
          recipientName: recipient.name || recipientAddress,
          recipientType: 'Givether',
          recipient: getEntityLink(recipient, AdminTypes.GIVER),
          amount: '-',
          currency: '-',
          actionTakerAddress,
          actionRecipientAddress: pluginAddress,
          etherscanLink: getEtherscanLink(transactionHash),
        };

        insertCampaignBalanceItems(result);
        insertTraceBalanceItems(_id, result, payouts.bridgeInfo);

        // Clear payouts
        payouts = {};

        stream.push(result);
      }
    };

    const addPayout = async (stream, donation, createdAt) => {
      await updateBalance({ donation });
      const { transactionHash, balance = {}, bridgeInfo = {} } = payouts;
      const {
        amount,
        actionTakerAddress,
        commitTime = createdAt,
        ownerEntity,
        txHash,
        token,
        ownerTypeId,
        bridgePaymentExecutedTime,
        bridgePaymentExecutedTxHash,
        bridgeStatus,
      } = donation;
      // Its a new payouts, the collected one should be printed
      if (transactionHash && transactionHash !== txHash) {
        await flushPayouts(stream);
      }

      payouts.ownerId = ownerTypeId;
      const { symbol } = token;
      const tokenBalance = balance[symbol] || new BigNumber(0);
      tokenBalance.plus(amount);
      balance[symbol] = tokenBalance;
      bridgeInfo[`${symbol}-bridgePaymentExecutedTime`] = bridgePaymentExecutedTime;
      bridgeInfo[`${symbol}-bridgeTransactionLink`] =
        bridgeStatus === 'Paid' ? getHomeEtherscanLink(bridgePaymentExecutedTxHash) : bridgeStatus;

      // This is new payout, info should be filled.
      // Fill the info by the first donation only, all donations of one payout has the similar value;
      if (transactionHash !== txHash) {
        payouts.transactionHash = txHash;
        payouts.balance = balance;
        payouts.bridgeInfo = bridgeInfo;
        payouts.ownerEntity = ownerEntity;
        payouts.actionTakerAddress = actionTakerAddress;
        payouts.commitTime = commitTime;
      }

      // Some donations doesn't have commitTime,
      // Fill payouts if the first donation doesn't have commitTime
      if (!payouts.commitTime) {
        payouts.commitTime = commitTime;
      }
    };

    return new Stream.Transform({
      objectMode: true,
      async transform(eventObject, _, callback) {
        const { event, transactionHash, returnValues, createdAt } = eventObject;
        let result = {
          createdAt: createdAt.toString(),
        };

        switch (event) {
          case 'ProjectAdded':
            {
              // Flush any payout if exists
              await flushPayouts(this);

              const projectId = Number(returnValues.idProject);
              if (campaign.projectId === projectId) {
                const { from } = await getTransaction(app, transactionHash);
                const actionTaker = await getUser(from);
                campaignOwner = from;
                result = {
                  ...result,
                  action: 'Campaign Created',
                  actor: actionTaker ? actionTaker.name : from,
                  actionOnBehalfOf: campaign.title,
                  recipientName: campaign.title,
                  recipientType: 'Campaign',
                  recipient: getEntityLink(campaign, AdminTypes.CAMPAIGN),
                  actionTakerAddress: from,
                  actionRecipientAddress: campaign.pluginAddress,
                  etherscanLink: getEtherscanLink(transactionHash),
                };
              } else {
                const trace = traceMap.get(projectId);
                if (trace) {
                  const { from } = await getTransaction(app, transactionHash);
                  const actionTaker = await getUser(from);
                  const action =
                    campaignOwner === actionTaker
                      ? 'Trace Created by Campaign Manager'
                      : 'Trace Accepted';
                  result = {
                    ...result,
                    action,
                    actor: actionTaker.name,
                    actionOnBehalfOf: campaign.title,
                    recipientName: trace.title,
                    recipientType: 'Trace',
                    recipient: getEntityLink(trace, AdminTypes.TRACE),
                    actionTakerAddress: from,
                    actionRecipientAddress:
                      trace.type === TraceTypes.LPMilestone
                        ? campaign.title
                        : trace.recipientAddress,
                    etherscanLink: getEtherscanLink(transactionHash),
                  };
                  initializeTraceBalance(trace);
                  insertTraceBalanceItems(trace._id, result, payouts.bridgeInfo);
                } else {
                  logger.error(
                    `campaign csv could'nt find corresponding project to id ${projectId}`,
                  );
                }
              }
            }
            break;

          case 'CancelProject':
            {
              // Flush any payout if exists
              await flushPayouts(this);

              const projectId = Number(returnValues.idProject);
              if (campaign.projectId === projectId) {
                const { from } = await getTransaction(app, transactionHash);
                // const actionTaker = await getUser(from);
                let actor;
                const { ownerAddress, reviewerAddress, coownerAddress } = campaign;
                if (ownerAddress === from) {
                  actor = 'Owner';
                } else if (reviewerAddress === from) {
                  actor = 'Reviewer';
                } else if (coownerAddress === from) {
                  actor = 'CoOwner';
                } else {
                  actor = 'Unknown';
                }

                campaignOwner = from;
                result = {
                  ...result,
                  action: 'Campaign Canceled',
                  actor,
                  actionOnBehalfOf: 'Campaign',
                  recipientName: campaign.title,
                  recipientType: 'Campaign',
                  recipient: getEntityLink(campaign, AdminTypes.CAMPAIGN),
                  actionTakerAddress: from,
                  actionRecipientAddress: campaign.pluginAddress,
                  etherscanLink: getEtherscanLink(transactionHash),
                };
              } else {
                const trace = traceMap.get(projectId);
                if (trace) {
                  const { from } = await getTransaction(app, transactionHash);
                  const actionTaker = await getUser(from);

                  // let actionOnBehalfOf;
                  // const { ownerAddress, reviewerAddress, recipientAddress } = trace;
                  // if (ownerAddress === from) {
                  //   actionOnBehalfOf = 'Proposer';
                  // } else if (reviewerAddress === from) {
                  //   actionOnBehalfOf = 'Reviewer';
                  // } else if (recipientAddress === from) {
                  //   actionOnBehalfOf = 'Recipient';
                  // } else if (campaign.ownerAddress === from) {
                  //   actionOnBehalfOf = 'Campaign Owner';
                  // } else if (campaign.reviewerAddress === from) {
                  //   actionOnBehalfOf = 'Campaign Reviewer';
                  // } else {
                  //   actionOnBehalfOf = 'Unknown';
                  // }
                  //
                  result = {
                    ...result,
                    action: 'Trace Canceled',
                    actor: actionTaker && actionTaker.name ? actionTaker.name : from,
                    actionOnBehalfOf: trace.title,
                    recipientName: campaign.title,
                    recipientType: 'Campaign',
                    recipient: getEntityLink(campaign, AdminTypes.CAMPAIGN),
                    actionTakerAddress: from,
                    actionRecipientAddress: trace.pluginAddress,
                    etherscanLink: getEtherscanLink(transactionHash),
                  };
                  initializeTraceBalance(trace);
                  insertTraceBalanceItems(trace._id, result, payouts.bridgeInfo);
                } else {
                  logger.error(
                    `campaign csv could'nt find corresponding project to id ${projectId}`,
                  );
                }
              }
            }
            break;
          case 'Transfer':
            {
              const { from, to, amount } = returnValues;

              // Money is moved to pledge owned by campaign or one of its traces
              const toPledgeIds = pledgeIds.has(to);
              // Money is exited from a pledge owned by canceled donation
              // const fromCanceledPledge = canceledPledgeIds.has(from);

              const [donation] = await donationService.find({
                query: { txHash: transactionHash, pledgeId: to, amount },
                paginate: false,
                schema: 'includeTypeDetails',
              });

              // Donation not found, put the event data
              if (!donation) {
                result = {
                  ...result,
                  etherscanLink: getEtherscanLink(transactionHash),
                  amount: Web3.utils.fromWei(amount).toString(),
                };
                callback(null, result);
                return;
              }
              const {
                homeTxHash,
                giverAddress,
                ownerEntity,
                ownerType,
                token,
                parentDonations,
                actionTakerAddress,
                delegateType,
                delegateEntity,
                status,
                commitTime = createdAt,
                isReturn,
              } = donation;

              let action;
              let actor;
              let recipientName;
              let recipientType;
              let recipient;
              let resolvedActionTakerAddress;
              let actionOnBehalfOf;
              let actionRecipientAddress;
              let insertTraceId;

              const capitalizeOwnerType = capitalizeAdminType(ownerType);

              // Money movement from pledge with higher id number to pledge with lower id number
              // is a sign of money revert
              if (isReturn) {
                switch (ownerType) {
                  case AdminTypes.GIVER:
                    if (delegateType === AdminTypes.COMMUNITY) {
                      action = 'Donation returned to COMMUNITY';
                      recipientName = delegateEntity.title;
                      recipientType = 'DAC';
                      recipient = getEntityLink(delegateEntity, AdminTypes.COMMUNITY);
                      actionRecipientAddress = delegateEntity.pluginAddress;
                    } else {
                      action = "Donation returned to Giver's Delegation Account";
                      recipientName = ownerEntity.name;
                      recipientType = 'Giver';
                      recipient = getEntityLink(ownerEntity, AdminTypes.GIVER);
                      actionRecipientAddress = ownerEntity.address;
                    }
                    break;

                  case AdminTypes.CAMPAIGN:
                    action = 'Donation returned to Campaign';
                    recipientName = ownerEntity.title;
                    recipientType = 'Campaign';
                    recipient = getEntityLink(ownerEntity, AdminTypes.CAMPAIGN);
                    actionRecipientAddress = ownerEntity.pluginAddress;
                    break;

                  default:
                    action = 'Donation Reverted';
                }

                if (actionTakerAddress) {
                  resolvedActionTakerAddress = actionTakerAddress;
                } else {
                  const tx = await getTransaction(app, transactionHash);
                  resolvedActionTakerAddress = tx.from;
                }
                const actionTaker = await getUser(resolvedActionTakerAddress);
                actor = actionTaker && actionTaker.name;
                const [fromDonation] = await donationService.find({
                  query: { pledgeId: from },
                  $limit: 1,
                  $select: ['ownerType', 'ownerTypeId'],
                  paginate: false,
                });
                if (fromDonation) {
                  actionOnBehalfOf = capitalizeAdminType(fromDonation.ownerType);
                  if (fromDonation.ownerType === AdminTypes.TRACE) {
                    insertTraceId = fromDonation.ownerTypeId;
                  }
                }

                await updateBalance({ donation, revertedFrom: fromDonation.ownerTypeId });
              } else if (toPledgeIds) {
                if (status === DonationStatus.PAID) {
                  await addPayout(this, donation, createdAt);
                  // Payouts should be accumulated and printed once
                  callback();
                  return;
                }

                // Flush any payout if exists
                await flushPayouts(this);
                const {
                  isDelegate,
                  parentOwnerTypeId,
                  parentOwnerType,
                } = await donationDelegateStatus(parentDonations[0]);

                // Update campaign and traces balance
                await updateBalance({ donation, isDelegate, parentId: parentOwnerTypeId });

                if (actionTakerAddress) {
                  resolvedActionTakerAddress = actionTakerAddress;
                } else {
                  const tx = await getTransaction(app, transactionHash);
                  resolvedActionTakerAddress = tx.from;
                }

                let actionTaker;
                let giver;

                let capitalizedParentOwnerType;
                let delegateActorName;
                if (isDelegate) {
                  capitalizedParentOwnerType = capitalizeAdminType(parentOwnerType);
                  delegateActorName = `${capitalizedParentOwnerType} Manager`;
                }

                if (resolvedActionTakerAddress === giverAddress) {
                  giver = await getUser(resolvedActionTakerAddress);
                  actionTaker = isDelegate ? delegateActorName : giver;
                } else {
                  [giver, actionTaker] = await Promise.all([
                    getUser(resolvedActionTakerAddress),
                    isDelegate
                      ? Promise.resolve({ name: delegateActorName })
                      : getUser(giverAddress),
                  ]);
                }

                if (!actionTaker || !actionTaker.name) {
                  actionTaker = {
                    name: isDelegate ? delegateActorName : resolvedActionTakerAddress,
                  };
                }

                actor = actionTaker.name;

                if (!giver || !giver.name) giver = { name: giverAddress };

                // Action and Actor
                if (isDelegate) {
                  action = `${capitalizedParentOwnerType} Delegated to ${capitalizeOwnerType}`;
                } else if (ownerType === AdminTypes.CAMPAIGN) {
                  action = 'Campaign Received Donation';
                } else {
                  action = 'Direct Donation to Trace';
                }

                resolvedActionTakerAddress = isDelegate ? actionTakerAddress : giverAddress;
                if (status === DonationStatus.CANCELED) {
                  action += ' - Canceled Later';
                }

                if (!isDelegate) {
                  actionOnBehalfOf = giver.name;
                } else if (parentOwnerType === AdminTypes.COMMUNITY) {
                  const [parentOwner] = await communityService.find({
                    query: {
                      _id: parentOwnerTypeId,
                      $select: ['title'],
                    },
                    paginate: false,
                  });
                  actionOnBehalfOf = parentOwner && parentOwner.title;
                } else {
                  actionOnBehalfOf = campaign.title;
                }

                recipientName = ownerEntity.title;
                recipientType = capitalizeOwnerType;
                recipient = getEntityLink(ownerEntity, ownerType);
                if (ownerType === AdminTypes.TRACE) {
                  const trace = ownerEntity;
                  actionRecipientAddress =
                    trace.type === TraceTypes.LPMilestone ? campaign.title : trace.recipientAddress;
                  insertTraceId = ownerEntity._id;
                } else {
                  actionRecipientAddress = ownerEntity.title;
                }
              }

              result = {
                ...result,
                action,
                actor,
                actionOnBehalfOf,
                recipientName,
                recipientType,
                recipient,
                amount: Web3.utils.fromWei(amount).toString(),
                currency: token.name,
                createdAt: commitTime.toString(),
                actionTakerAddress: resolvedActionTakerAddress,
                actionRecipientAddress,
                etherscanLink: getEtherscanLink(transactionHash),
                homeEtherscanLink: getHomeEtherscanLink(homeTxHash),
              };
              if (insertTraceId) {
                insertTraceBalanceItems(insertTraceId, result, payouts.bridgeInfo);
              }
            }
            break;

          default:
        }

        insertCampaignBalanceItems(result);

        callback(null, result);
      },
      async flush(callback) {
        await flushPayouts(this);
        callback();
      },
    });
  };

  return {
    newEventTransform,
  };
};

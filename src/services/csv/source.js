const Stream = require('stream');

const { DonationStatus } = require('../../models/donations.model');
const { EventStatus } = require('../../models/events.model');

module.exports = app => {
  const traceService = app.service('traces');
  const donationModel = app.service('donations').Model;
  const eventModel = app.service('events').Model;

  const getCampaignTraces = async campaignId => {
    return traceService.find({
      query: {
        campaignId,
        $select: [
          '_id',
          'projectId',
          'migratedProjectId',
          'createdAt',
          'ownerAddress',
          'tokenAddress',
          'title',
          'pluginAddress',
          'campaignId',
          'maxAmount',
          'type',
          'recipientAddress',
        ],
        $sort: { createdAt: 1 },
      },
      paginate: false,
    });
  };

  const getPledgeIdsByOwnersAndState = async (ownerIds, states) => {
    const distinctPledgeIds = await donationModel.distinct('pledgeId', {
      ownerTypeId: { $in: ownerIds },
      status: { $in: states },
    });
    return distinctPledgeIds.map(String);
  };
  const getAllPledgeIdsByOwners = async ownerIds => {
    return getPledgeIdsByOwnersAndState(ownerIds, [
      DonationStatus.COMMITTED,
      DonationStatus.PAID,
      DonationStatus.CANCELED,
    ]);
  };
  const getCanceledPledgeIdsByOwners = async ownerIds => {
    return getPledgeIdsByOwnersAndState(ownerIds, [DonationStatus.CANCELED]);
  };
  const getProjectIdsOfCampaignAndItsTraces = (projectId, traces) => {
    // List of projects ID of campaign and its traces
    const projectIds = [String(projectId)];
    traces.forEach(trace => {
      const { projectId: traceProjectId, migratedProjectId } = trace;
      if (migratedProjectId) {
        projectIds.push(String(migratedProjectId));
      } else if (traceProjectId && traceProjectId > 0) {
        projectIds.push(String(traceProjectId));
      }
    });
    return projectIds;
  };
  // Get stream of items to be written to csv for the campaign, plus traces of this campaign
  const getData = async campaign => {
    const { _id: id, projectId } = campaign;
    const traces = await getCampaignTraces(id);
    const [pledgeIds, canceledPledgeIds] = await Promise.all([
      getAllPledgeIdsByOwners([id, ...traces.map(m => m._id)]),
      getCanceledPledgeIdsByOwners([id, ...traces.map(m => m._id)]),
    ]);
    const projectIds = await getProjectIdsOfCampaignAndItsTraces(projectId, traces);
    const transformer = new Stream.Transform({ objectMode: true });
    transformer._transform = async (fetchedEvent, encoding, callback) => {
      const { event } = fetchedEvent;
      if (event !== 'Transfer') {
        callback(null, fetchedEvent);
        return;
      }
      const { returnValues, transactionHash } = fetchedEvent;
      const { from, to, amount } = returnValues;

      const data = await eventModel.findOne({
        transactionHash,
        event,
        'returnValues.from': to,
        'returnValues.to': from,
        'returnValues.amount': amount,
      });
      // Transfer is not returned immediately
      if (!data) {
        callback(null, fetchedEvent);
      } else {
        callback();
      }
    };
    const stream = eventModel
      .find({
        status: EventStatus.PROCESSED,
        $or: [
          {
            event: {
              $in: [
                'ProjectAdded',
                'CancelProject',
                // 'ProjectUpdated',
                // 'MilestoneCompleteRequestApproved',
                // 'MilestoneCompleteRequestRejected',
                // 'MilestoneCompleteRequested',
                // 'PaymentCollected',
                // 'RecipientChanged',
              ],
            },
            'returnValues.idProject': { $in: projectIds.map(String) },
          },
          {
            event: 'Transfer',
            $or: [
              { 'returnValues.from': { $in: canceledPledgeIds } },
              { 'returnValues.to': { $in: pledgeIds } },
            ],
          },
        ],
      })
      .select(['event', 'returnValues', 'transactionHash', 'createdAt'])
      .sort({ blockNumber: 1, transactionIndex: 1, logIndex: 1 })
      .stream()
      .pipe(transformer);

    return {
      eventsStream: stream,
      traces,
      pledgeIds: new Set(pledgeIds),
      canceledPledgeIds: new Set(canceledPledgeIds),
    };
  };

  return { getData };
};

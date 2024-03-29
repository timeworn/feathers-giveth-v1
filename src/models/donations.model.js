// donations-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

const DonationStatus = {
  PENDING: 'Pending',
  PAYING: 'Paying',
  PAID: 'Paid',
  TO_APPROVE: 'ToApprove',
  WAITING: 'Waiting',
  COMMITTED: 'Committed',
  CANCELED: 'Canceled',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
};

const DonationBridgeStatus = {
  PAID: 'Paid',
};

function Donation(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const donation = new Schema(
    {
      giverAddress: { type: String, required: true, index: true },
      actionTakerAddress: { type: String },
      amount: { type: Schema.Types.BN, required: true, min: 0 },
      amountRemaining: { type: Schema.Types.BN, required: true, min: 0 },
      pendingAmountRemaining: { type: Schema.Types.BN, min: 0 },
      pledgeId: { type: Schema.Types.BN, required: true },
      paymentId: { type: Schema.Types.BN },
      canceledPledgeId: { type: Schema.Types.BN },
      ownerId: { type: Schema.Types.Long, required: true }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      ownerTypeId: { type: String, required: true, index: true },
      ownerType: { type: String, required: true },
      intendedProjectId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      intendedProjectTypeId: { type: String },
      intendedProjectType: { type: String },
      delegateId: { type: Schema.Types.Long }, // we can use Long here b/c lp only stores adminId in pledges as uint64
      delegateTypeId: { type: String },
      delegateType: { type: String },
      campaignId: { type: String },
      status: {
        type: String,
        required: true,
        enum: Object.values(DonationStatus),
        default: DonationStatus.PENDING,
        index: true,
      },
      bridgeStatus: {
        type: String,
        enum: Object.values(DonationBridgeStatus),
      },
      bridgePaymentAuthorizedTxHash: { type: String }, // The first transaction made by bridge on payment
      bridgePaymentExecutedTxHash: { type: String }, // The second one which transfer money to user wallet
      bridgePaymentExecutedTime: { type: Date },
      txHash: { type: String, index: true },
      homeTxHash: { type: String },
      commitTime: { type: Date },
      mined: { type: Boolean, default: false, required: true, index: true },
      parentDonations: { type: [String], default: [], required: true },
      isReturn: { type: Boolean, default: false },
      tokenAddress: { type: String, required: true },
      lessThanCutoff: { type: Boolean, default: false },
      usdValue: { type: Number, default: 0 },
      txNonce: { type: Number },
      comment: { type: String },
    },
    {
      timestamps: true,
    },
  );
  // donation.index({ createdAt: 1, status: 1, amountRemaining: 1,
  //   ownerTypeId: 1,delegateTypeId:1, delegateId: 1, lessThanCutoff: 1 });
  donation.index({
    status: 1,
    intendedProjectTypeId: 1,
    amount: 1,
    ownerTypeId: 1,
    isReturn: 1,
    usdValue: 1,
    createdAt: 1,
  });
  donation.index({
    status: 1,
    delegateTypeId: 1,
    isReturn: 1,
    intendedProjectId: 1,
    usdValue: 1,
    createdAt: 1,
  });

  donation.index({
    giverAddress: 1,
    homeTxHash: 1,
    parentDonations: 1,
    canceledPledgeId: 1,
    lessThanCutoff: 1,
  });
  donation.index({
    createdAt: 1,
    status: 1,
    lessThanCutoff: 1,
    delegateTypeId: 1,
    ownerTypeId: 1,
    delegateId: 1,
  });
  donation.index({ giverAddress: 1, lessThanCutoff: 1, createdAt: 1 });
  donation.index({ txHash: 1, pledgeId: 1, amount: 1 });
  donation.index({
    ownerTypeId: 1,
    intendedProjectTypeId: 1,
    amountRemaining: 1,
  });
  donation.index({
    ownerTypeId: 1,
    status: 1,
    commitTime: 1,
    intendedProjectTypeId: 1,
  });
  donation.index({
    txHash: 1,
    mined: 1,
    createdAt: 1,
    giverAddress: 1,
    amount: 1,
  });
  donation.index({ createdAt: 1, pledgeId: 1, amountRemaining: 1, amount: 1 });
  donation.index({ amountRemaining: 1, status: 1, intendedProjectId: 1, commitTime: 1 });
  donation.index({ amountRemaining: 1, status: 1, ownerTypeId: 1 });
  donation.index({ mined: 1, status: 1, createdAt: 1 });
  donation.index({ isReturn: 1, mined: 1, parentDonations: 1 });
  return mongooseClient.model('donations', donation);
}

module.exports = {
  DonationStatus,
  DonationBridgeStatus,
  createModel: Donation,
};

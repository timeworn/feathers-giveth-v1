const DacStatus = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};

// dacs-model.js - A mongoose model
//
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.
function createModel(app) {
  const mongooseClient = app.get('mongooseClient');
  const { Schema } = mongooseClient;
  const dac = new Schema(
    // TODO note: the following commenting out of required is b/c
    // if a dac is added to lp not from the dapp, we can't
    // guarnantee that those fields are present until we have
    // ipfs enabled
    {
      title: { type: String, required: true },
      description: { type: String }, // required: true },
      communityUrl: { type: String },
      delegateId: { type: Schema.Types.Long, index: true },
      status: {
        type: String,
        require: true,
        enum: Object.values(DacStatus),
        default: DacStatus.PENDING,
      },
      image: { type: String }, // required: true },
      txHash: { type: String },
      totalDonated: { type: Schema.Types.Long },
      donationCount: { type: Number },
      ownerAddress: { type: String, required: true, index: true },
      pluginAddress: { type: String },
      tokenAddress: { type: String },
      mined: { type: Boolean },
    },
    {
      timestamps: true,
    },
  );

  return mongooseClient.model('dac', dac);
}

module.exports = {
  DacStatus,
  createModel,
};

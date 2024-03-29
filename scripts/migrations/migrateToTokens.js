const mongoose = require('mongoose');

/**
 * NOTE: Make sure to point this to the correct config!
 * */
// eslint-disable-next-line import/no-unresolved
const config = require('../../config/develop.json');

const mongoUrl = config.mongodb;
mongoose.connect(mongoUrl);
const db = mongoose.connection;
const Milestones = db.collection('milestones');
const DACs = db.collection('dacs');
const Campaigns = db.collection('campaigns');
const Donations = db.collection('donations');
const ETHConversion = db.collection('ethconversions');

db.on('error', err => console.error('migrateToTokens > Could not connect to Mongo', err));

const ETH = config.tokenWhitelist.find(t => t.symbol === 'ETH');
if (!ETH) {
  // eslint-disable-next-line no-throw-literal
  throw 'ETH token not found! Add ETH token first ';
  // eslint-disable-next-line no-unreachable
  process.exit();
}

const { name, address, foreignAddress, symbol } = ETH;

/*
  Doing a raw db migration to make sure we don't change any timestamps!
*/

const migrateMilestonesToTokens = () => {
  return new Promise((resolve, reject) => {
    Milestones.updateMany(
      {},
      {
        $set: {
          token: {
            name,
            address,
            foreignAddress,
            symbol,
          },
        },
      },
    )
      .then(res => {
        console.log(
          `migrateMilestonesToTokens > migrated ${res.result.nModified} of total ${res.result.n} milestones`,
        );
        resolve();
      })
      .catch(err => {
        console.log('migrateMilestonesToTokens > error migrating traces ', err);
        reject();
      });
  });
};

const migrateDACsToTokens = () => {
  return new Promise((resolve, reject) =>
    DACs.find({}).toArray((err, dacs) =>
      // eslint-disable-next-line array-callback-return
      dacs.map(dac => {
        DACs.updateOne(
          { _id: dac._id },
          {
            $set: {
              donationCounters: [
                {
                  name: 'Ether',
                  address: '0x0',
                  symbol: 'ETH',
                  decimals: 18,
                  totalDonated: dac.totalDonated,
                  currentBalance: dac.currentBalance,
                  donationCount: dac.donationCount,
                },
              ],
            },
            // $unset: {
            //   totalDonated: "",
            //   currentBalance: "",
            //   donationCount: "",
            // }
          },
        )
          // eslint-disable-next-line no-unused-vars
          .then(res => {
            console.log(`migrateDACsToTokens > migrated ${dac._id}`);
            resolve();
          })
          // eslint-disable-next-line no-shadow
          .catch(err => {
            console.log(`migrateDACsToTokens > error migrating dac ${dac._id}`, err);
            reject();
          });
      }),
    ),
  );
};

const migrateCampaignsToTokens = () => {
  return new Promise((resolve, reject) =>
    Campaigns.find({}).toArray((err, campaigns) =>
      // eslint-disable-next-line array-callback-return
      campaigns.map(campaign => {
        Campaigns.updateOne(
          { _id: campaign._id },
          {
            $set: {
              donationCounters: [
                {
                  name: 'Ether',
                  address: '0x0',
                  symbol: 'ETH',
                  decimals: 18,
                  totalDonated: campaign.totalDonated,
                  currentBalance: campaign.currentBalance,
                  donationCount: campaign.donationCount,
                },
              ],
            },
            // $unset: {
            //   totalDonated: "",
            //   currentBalance: "",
            //   donationCount: "",
            // }
          },
        )
          // eslint-disable-next-line no-unused-vars
          .then(res => {
            console.log(`migrateCampaignsToTokens > migrated ${campaign._id}`);
            resolve();
          })
          // eslint-disable-next-line no-shadow
          .catch(err => {
            console.log(`migrateCampaignsToTokens > error migrating campaign ${campaign._id}`, err);
            reject();
          });
      }),
    ),
  );
};

const migrateDonationsToTokens = () => {
  return new Promise((resolve, reject) =>
    Donations.updateMany(
      {},
      {
        $set: {
          token: {
            name,
            address: '0x0',
            foreignAddress,
            symbol,
          },
        },
      },
    )
      .then(res => {
        console.log(
          `migrateDonationsToTokens > migrated ${res.result.nModified} of total ${res.result.n} donations`,
        );
        resolve();
      })
      .catch(err => {
        console.log('migrateDonationsToTokens > error migrating donations ', err);
        reject();
      }),
  );
};

const migrateEthConversions = () => {
  return new Promise((resolve, reject) => {
    // remove and create new indexes
    ETHConversion.getIndexes()
      .then(indexes => {
        if (Object.keys(indexes).includes('timestamp_1')) {
          ETHConversion.dropIndex('timestamp_1')
            // eslint-disable-next-line no-unused-vars
            .then(res =>
              console.log('migrateEthConversions > dropped timestamp index on ethconversions'),
            )
            // eslint-disable-next-line no-unused-vars
            .catch(err =>
              console.log(
                'migrateEthConversions > could not drop timestamp index on ethconversions',
              ),
            );
        } else {
          console.log('migrateEthConversions > index timestamp already dropped');
        }
      })
      // eslint-disable-next-line no-unused-vars
      .catch(err => console.log('migrateEthConversions > could not get indexes'));

    ETHConversion.getIndexes()
      .then(indexes => {
        if (!Object.keys(indexes).includes('timestamp_1_symbol_1')) {
          ETHConversion.createIndex({ timestamp: 1, symbol: 1 }, { unique: true })
            // eslint-disable-next-line no-unused-vars
            .then(res =>
              console.log(
                'migrateEthConversions > created symbol/timestamp index on ethconversions',
              ),
            )
            // eslint-disable-next-line no-unused-vars
            .catch(err =>
              console.log(
                'migrateEthConversions > could not create symbol/timestamp index on ethconversions',
              ),
            );
        } else {
          console.log('migrateEthConversions > index timestamp/symbol already created');
        }
      })
      // eslint-disable-next-line no-unused-vars
      .catch(err => console.log('migrateEthConversions > could not get indexes'));

    ETHConversion.updateMany(
      {},
      {
        $set: {
          symbol,
        },
      },
    )
      .then(res => {
        console.log(
          `EthConversions > migrated ${res.result.nModified} of total ${res.result.n} ethconversions`,
        );
        resolve();
      })
      .catch(err => {
        console.log('EthConversions > error migrating ethconversions ', err);
        reject();
      });
  });
};

// once mongo connected, start migration
db.once('open', () => {
  console.log('Connected to Mongo');
  console.log(
    'Migration: adding token properties to communities, campaigns, traces, donations and ethconversions',
  );

  Promise.all([
    migrateDACsToTokens(),
    migrateCampaignsToTokens(),
    migrateMilestonesToTokens(),
    migrateDonationsToTokens(),
    migrateEthConversions(),
  ])
    // eslint-disable-next-line no-unused-vars
    .then(res => process.exit())
    .catch(err => {
      console.log(err);
      process.exit();
    });
});

const { assert } = require('chai');
const request = require('supertest');
const config = require('config');
const { getFeatherAppInstance } = require('../app');
const {
  SAMPLE_DATA,
  getJwt,
  generateRandomTxHash,
  generateRandomEtheriumAddress,
} = require('../../test/testUtility');
const { CONVERSATION_MESSAGE_CONTEXT } = require('../models/conversations.model');

const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/conversations';

const {
  createDelegatedConversation,
  aggregatePayments,
  createPayoutConversation,
  createDonatedConversation,
  createRecipientChangedConversation,
} = require('./conversationCreator');

let app;

before(() => {
  app = getFeatherAppInstance();
});

function createDelegatedConversationTestCases() {
  it('should update existing conversation payments instead of creating new one', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const firstPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '100000000000000000',
    };
    const secondPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '200000000000000000',
    };
    const payload = {
      milestoneId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Milestone owner',
      messageContext: 'delegated',
      txHash,
      payments: [firstPayment],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const { body: parentDonation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({ ...SAMPLE_DATA.DONATION_DATA, ownerTypeId: milestoneId });
    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
        parentDonations: [parentDonation],
      });
    await createDelegatedConversation(app, {
      milestoneId,
      donationId: donation._id,
      txHash,
      payment: secondPayment,
      parentDonations: donation.parentDonations,
      actionTakerAddress: donation.actionTakerAddress,
    });
    const conversations = await app.service('conversations').find({
      paginate: false,
      query: {
        milestoneId,
        txHash,
      },
    });
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].payments[0].amount, '300000000000000000');
  });
  it('should create new conversation while txHash is different', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const firstPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '100000000000000000',
    };
    const payload = {
      milestoneId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Milestone owner',
      messageContext: 'delegated',
      txHash,
      payments: [firstPayment],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);
    const { body: parentDonation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({ ...SAMPLE_DATA.DONATION_DATA, ownerTypeId: milestoneId });
    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
        parentDonations: [parentDonation],
      });
    const secondPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '200000000000000000',
    };
    const secondTxHash = generateRandomTxHash();
    await createDelegatedConversation(app, {
      milestoneId,
      donationId: donation._id,
      txHash: secondTxHash,
      payment: secondPayment,
      parentDonations: donation.parentDonations,
      actionTakerAddress: donation.actionTakerAddress,
    });
    const conversations = await app.service('conversations').find({
      paginate: false,
      query: {
        milestoneId,
        txHash: secondTxHash,
      },
    });
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].payments[0].amount, secondPayment.amount);
  });
}
function createPayoutConversationTestCases() {
  it('should update existing conversation payments instead of creating new one', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const milestone = await app.service('milestones').get(milestoneId);
    const firstPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '100000000000000000',
    };
    const secondPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '200000000000000000',
    };
    const payload = {
      milestoneId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Milestone owner',
      messageContext: 'payout',
      txHash,
      payments: [firstPayment],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);

    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
      });
    await createPayoutConversation(app, {
      milestoneId,
      donationId: donation._id,
      txHash,
      payment: secondPayment,
      timestamp: new Date(),
      performedByAddress: milestone.recipientAddress,
    });
    const conversations = await app.service('conversations').find({
      paginate: false,
      query: {
        milestoneId,
        txHash,
      },
    });
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].payments[0].amount, '300000000000000000');
  });
  it('should create new conversation while txHash is different', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const milestone = await app.service('milestones').get(milestoneId);
    const firstPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '100000000000000000',
    };
    const payload = {
      milestoneId,
      ownerAddress: SAMPLE_DATA.USER_ADDRESS,
      performedByRole: 'Milestone owner',
      messageContext: 'delegated',
      txHash,
      payments: [firstPayment],
    };
    await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(payload);

    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
      });
    const secondPayment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '200000000000000000',
    };
    const secondTxHash = generateRandomTxHash();
    const result = await createPayoutConversation(app, {
      milestoneId,
      donationId: donation._id,
      txHash: secondTxHash,
      payment: secondPayment,
      timestamp: new Date(),
      performedByAddress: milestone.recipientAddress,
    });
    assert.ok(result);
    const conversations = await app.service('conversations').find({
      paginate: false,
      query: {
        milestoneId,
        txHash: secondTxHash,
      },
    });
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].payments[0].amount, secondPayment.amount);
    assert.equal(conversations[0].ownerAddress, milestone.recipientAddress);
  });
}

function createDonatedConversationTestCases() {
  it('should create a donated conversation', async () => {
    const currencySymbol = 'ETH';
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const payment = {
      symbol: currencySymbol,
      decimals: 6,
      amount: '100000000000000000',
    };

    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
      });
    const conversation = await createDonatedConversation(app, {
      milestoneId,
      donationId: donation._id,
      homeTxHash: txHash,
      payment,
      parentDonations: donation.parentDonations,
      actionTakerAddress: donation.actionTakerAddress,
    });
    assert.ok(conversation);
    assert.equal(conversation.payments[0].amount, payment.amount);
    const conversations = await app.service('conversations').find({
      paginate: false,
      query: {
        milestoneId,
        txHash,
        messageContext: CONVERSATION_MESSAGE_CONTEXT.DONATED,
      },
    });
    assert.equal(conversations.length, 1);
  });
}
function createRecipientChangedConversationTestCases() {
  it('should create a recipientChanged conversation', async () => {
    const txHash = generateRandomTxHash();
    const milestoneId = SAMPLE_DATA.MILESTONE_ID;
    const { body: donation } = await request(baseUrl)
      .post('/donations')
      .set({ Authorization: getJwt() })
      .send({
        ...SAMPLE_DATA.DONATION_DATA,
        ownerTypeId: milestoneId,
      });
    const recipientAddress = generateRandomEtheriumAddress();
    const from = generateRandomEtheriumAddress();
    const conversation = await createRecipientChangedConversation(app, {
      milestoneId,
      donationId: donation._id,
      newRecipientAddress: recipientAddress,
      from,
      timestamp: new Date(),
      txHash,
    });
    assert.ok(conversation);
    assert.equal(conversation.ownerAddress, from);
    assert.equal(conversation.recipientAddress, recipientAddress);
    assert.equal(conversation.messageContext, 'recipientChanged');
  });
}

function aggregatePaymentsTestCases() {
  it('should add amounts for existing payment currency', () => {
    const oldPayments = [
      {
        amount: '10000000000',
        symbol: 'ETH',
      },
    ];
    const newPayment = {
      amount: '20000000000',
      symbol: 'ETH',
    };

    const newPayments = aggregatePayments({
      payments: oldPayments,
      newPayment,
    });
    assert.equal(newPayments.length, 1);
    assert.equal(newPayments[0].amount, '30000000000');
  });
  it('should add new payment in array for new currency', () => {
    const oldPayments = [
      {
        amount: '10000000000',
        symbol: 'ETH',
      },
    ];
    const newPayment = {
      amount: '20000000000',
      symbol: 'DAI',
    };

    const newPayments = aggregatePayments({
      payments: oldPayments,
      newPayment,
    });
    assert.equal(newPayments.length, 2);
    assert.equal(newPayments[0].amount, '10000000000');
    assert.equal(newPayments[1].amount, '20000000000');
  });
}

describe('createDelegatedConversation() test cases', createDelegatedConversationTestCases);
describe('createPayoutConversation() test cases', createPayoutConversationTestCases);
describe('createDonatedConversation() test cases', createDonatedConversationTestCases);
describe(
  'createRecipientChangedConversation() test cases',
  createRecipientChangedConversationTestCases,
);
describe('aggregatePayments() test cases', aggregatePaymentsTestCases);

before(() => {
  app = getFeatherAppInstance();
});

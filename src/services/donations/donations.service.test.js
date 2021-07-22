const request = require('supertest');
const config = require('config');
const { assert, expect } = require('chai');
const { getJwt, SAMPLE_DATA } = require('../../../test/testUtility');
const { getFeatherAppInstance } = require('../../app');
const { getTokenBySymbol } = require('../../utils/tokenHelper');

const app = getFeatherAppInstance();
const baseUrl = config.get('givethFathersBaseUrl');
const relativeUrl = '/donations';
const createDonationPayload = {
  amount: '1793698658625350941',
  amountRemaining: '9793698658625350941',
  giverAddress: SAMPLE_DATA.USER_ADDRESS,
  ownerId: 49,
  ownerTypeId: SAMPLE_DATA.MILESTONE_ID,
  ownerType: 'milestone',
  pledgeId: '89',
  token: {
    name: 'ETH',
    address: '0x0',
    foreignAddress: '0xe3ee055346a9EfaF4AA2900847dEb04de0195398',
    symbol: 'ETH',
    decimals: '3',
  },
};

async function createDonation(data) {
  const response = await request(baseUrl)
    .post(relativeUrl)
    .set({ Authorization: getJwt() })
    .send(data);
  return response.body;
}

function getDonationsTestCases() {
  it('should return some values', async function() {
    const response = await request(baseUrl).get(relativeUrl);
    assert.equal(response.statusCode, 200);
    assert.isArray(response.body.data);
  });
}

function postDonationsTestCases() {
  it('should return create donation successfully', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send(createDonationPayload);
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.amount, createDonationPayload.amount);

    // When dont sending status, ,status automatically will be Pending
    assert.equal(response.body.status, SAMPLE_DATA.DonationStatus.PENDING);
  });

  it('should return create donation successfully, and and add token to donation', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .set({ Authorization: getJwt() })
      .send({
        ...createDonationPayload,
        token: {
          symbol: 'ETH',
        },
      });
    assert.equal(response.statusCode, 201);
    assert.exists(response.body.token);
    assert.exists(response.body.token.foreignAddress);
    assert.exists(response.body.token.decimals);
    expect(response.body.token).to.be.deep.equal(getTokenBySymbol('ETH'));
  });

  it('should throw exception without bearer token', async function() {
    const response = await request(baseUrl)
      .post(relativeUrl)
      .send(createDonationPayload);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 401);
  });
}

function patchDonationsTestCases() {
  it('Should be successful update the status by patch method', async function() {
    const donation = await createDonation(createDonationPayload);
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${donation._id}`)
      .set({ Authorization: getJwt() })
      .send({
        status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
      });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.DonationStatus.TO_APPROVE);
  });

  it('Should be successful update the ToApprove status to Rejected', async function() {
    const donation = await createDonation({
      ...createDonationPayload,
      status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${donation._id}`)
      .set({ Authorization: getJwt() })
      .send({
        status: SAMPLE_DATA.DonationStatus.REJECTED,
      });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.DonationStatus.REJECTED);
  });

  it('Should be successful update the ToApprove status to Commited', async function() {
    const donation = await createDonation({
      ...createDonationPayload,
      status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${donation._id}`)
      .set({ Authorization: getJwt() })
      .send({
        status: SAMPLE_DATA.DonationStatus.COMMITTED,
      });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, SAMPLE_DATA.DonationStatus.COMMITTED);
  });

  it("Should throw error, update another user's donation", async function() {
    const donation = await createDonation({
      ...createDonationPayload,
    });
    const response = await request(baseUrl)
      .patch(`${relativeUrl}/${donation._id}`)
      .set({ Authorization: getJwt(SAMPLE_DATA.SECOND_USER_ADDRESS) })
      .send({
        status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
      });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 403);
  });

  it('Should throw forbidden error, updating donation with ToApprove status ', async function() {
    const donation = await createDonation({
      ...createDonationPayload,
      status: SAMPLE_DATA.DonationStatus.TO_APPROVE,
    });
    const invalidStatuses = [
      SAMPLE_DATA.DonationStatus.PENDING,
      SAMPLE_DATA.DonationStatus.CANCELED,
      SAMPLE_DATA.DonationStatus.FAILED,
      SAMPLE_DATA.DonationStatus.PAID,
      SAMPLE_DATA.DonationStatus.PAYING,
      SAMPLE_DATA.DonationStatus.WAITING,
      SAMPLE_DATA.DonationStatus.TO_APPROVE,
    ];
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const status of invalidStatuses) {
      const response = await request(baseUrl)
        .patch(`${relativeUrl}/${donation._id}`)
        .set({ Authorization: getJwt() })
        .send({
          status,
        });
      assert.equal(response.statusCode, 400);
      assert.equal(
        response.body.message,
        'status can only be updated to `Committed` or `Rejected`',
      );
    }
  });
}

function deleteDonationsTestCases() {
  it('should get 405, DEELTE method is no allowed', async function() {
    const response = await request(baseUrl)
      .delete(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

function putDonationsTestCases() {
  it('should get 405, PUT method is no allowed', async function() {
    const response = await request(baseUrl)
      .put(relativeUrl)
      .set({ Authorization: getJwt() });
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.code, 405);
  });
}

it('should donations service registration be ok', () => {
  const userService = app.service('donations');
  assert.ok(userService, 'Registered the service');
});
describe(`Test GET ${relativeUrl}`, getDonationsTestCases);
describe(`Test POST ${relativeUrl}`, postDonationsTestCases);
describe(`Test DELETE ${relativeUrl}`, deleteDonationsTestCases);
describe(`Test PUT ${relativeUrl}`, putDonationsTestCases);
describe(`Test PATCH ${relativeUrl}`, patchDonationsTestCases);

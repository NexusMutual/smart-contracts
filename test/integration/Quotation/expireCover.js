const { accounts, web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');

const { setNextBlockTime } = require('../../utils/evm');
const { buyCover } = require('../utils').buyCover;
const { bnEqual, hex } = require('../utils').helpers;
const { CoverStatus } = require('../utils').constants;
const { getAccounts } = require('../utils').accounts;

const {
  members: [member1],
} = getAccounts(accounts);

const coverTemplate = {
  amount: 1, // 100 ETH
  price: ether('0.01'),
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 30,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

describe('expireCover', function () {
  it('does not allow cover expiration before cover period end', async function () {
    const { qt, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    await setNextBlockTime(coverExpirationDate.subn(1).toNumber());

    await expectRevert(qt.expireCover(coverId), 'Quotation: cover is not due to expire');
  });

  it('allows cover expiration after cover period end', async function () {
    const { qt, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover(coverId);

    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    const expectedCoverStatus = CoverStatus.CoverExpired;
    assert.strictEqual(actualCoverStatus.toNumber(), expectedCoverStatus);
  });

  it('decreases the total sum assured upon expiration', async function () {
    const { qt, qd } = this.contracts;

    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    const coverId = '1';

    const { currency, contractAddress } = cover;
    const assuredBefore = await qd.getTotalSumAssured(currency);
    const assuredSCBefore = await qd.getTotalSumAssuredSC(contractAddress, currency);

    const coverExpirationDate = await qd.getValidityOfCover(coverId);
    await setNextBlockTime(coverExpirationDate.addn(1).toNumber());
    await qt.expireCover(coverId);

    const assuredAfter = await qd.getTotalSumAssured(currency);
    const assuredSCAfter = await qd.getTotalSumAssuredSC(contractAddress, currency);

    bnEqual(assuredBefore.subn(cover.amount), assuredAfter);
    bnEqual(assuredSCBefore.subn(cover.amount), assuredSCAfter);

    const actualCoverStatus = await qd.getCoverStatusNo(coverId);
    const expectedCoverStatus = CoverStatus.CoverExpired;
    assert.strictEqual(actualCoverStatus.toNumber(), expectedCoverStatus);
  });
});

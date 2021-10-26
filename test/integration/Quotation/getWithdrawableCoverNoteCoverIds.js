const { accounts } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;
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

describe('getWithdrawableCoverNoteCoverIds', function () {
  it('returns no ids when owner has no covers', async function () {
    const { qt } = this.contracts;
    const { expiredCoverIds, lockReasons } = await qt.getWithdrawableCoverNoteCoverIds(member1);

    assert.equal(expiredCoverIds.length, '0');
    assert.equal(lockReasons.length, '0');
  });

  it('returns no ids for v1 covers bought after lastCoverIdWithLockedCN', async function () {
    const { qt } = this.contracts;

    const cover1 = { ...coverTemplate };
    const cover2 = { ...coverTemplate, generationTime: coverTemplate.generationTime + 1 };
    await buyCover({ ...this.contracts, cover: cover1, coverHolder: member1 });
    await buyCover({ ...this.contracts, cover: cover2, coverHolder: member1 });

    const { expiredCoverIds, lockReasons } = await qt.getWithdrawableCoverNoteCoverIds(member1);

    assert.equal(expiredCoverIds.length, '0');
    assert.equal(lockReasons.length, '0');
  });
});

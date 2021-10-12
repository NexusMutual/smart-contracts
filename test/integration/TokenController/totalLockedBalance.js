const { accounts } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { buyCover } = require('../utils').buyCover;
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { bnEqual, hex } = require('../utils').helpers;

const [, member1] = accounts;
const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

describe.only('totalLockedBalance', function () {
  beforeEach(async function () {
    await enrollMember(this.contracts, [member1]);
  });

  it('accounts for tokens locked as cover note', async function () {
    const { qt: quotation, tc: tokenController } = this.contracts;
    const cover = { ...coverTemplate };
    const expectedCN = ether('1');
    const coverId = '1';

    // should not have any locked tokens initially
    bnEqual(await tokenController.totalLockedBalance(member1), 0);

    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    bnEqual(await tokenController.totalLockedBalance(member1), expectedCN);

    await time.increase(cover.period * 24 * 3600);
    bnEqual(await tokenController.totalLockedBalance(member1), expectedCN);

    await quotation.expireCover(coverId);
    bnEqual(await tokenController.totalLockedBalance(member1), expectedCN);

    const gracePeriod = await tokenController.claimSubmissionGracePeriod();
    await time.increase(gracePeriod);
    bnEqual(await tokenController.totalLockedBalance(member1), expectedCN);

    await quotation.withdrawCoverNote(member1, [coverId], ['0']);
    bnEqual(await tokenController.totalLockedBalance(member1), 0);
  });
});

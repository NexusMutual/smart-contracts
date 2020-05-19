const { accounts, defaultSender, web3 } = require('@openzeppelin/test-environment');
const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
require('chai').should();
const { getQuoteValues, getValue } = require('../external');
const setup = require('../setup');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const BN = web3.utils.BN;

function toWei (value) {
  return web3.utils.toWei(value, 'ether');
}

const fee = ether('0.002');

describe('stake', function () {

  this.timeout(10000);
  const owner = defaultSender;
  const [
    member1,
    member2,
    member3,
    staker1,
    staker2,
    coverHolder,
    nftCoverHolder1,
    distributorFeeReceiver,
  ] = accounts;

  const stakeTokens = ether('5');
  const tokens = ether('60');
  const validity = 30 * 24 * 60 * 60; // 30 days
  const UNLIMITED_ALLOWANCE = new BN('2')
    .pow(new BN('256'))
    .sub(new BN('1'));

  async function initMembers () {

    const { mr, mcr, pd, tk, tc } = this;

    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);

    const minimumCapitalRequirementPercentage = await getValue(toWei('2'), pd, mcr);
    console.log(`mcrP ${minimumCapitalRequirementPercentage}`);
    await mcr.addMCRData(
      minimumCapitalRequirementPercentage,
      toWei('100'),
      toWei('2'),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011, {
        from: owner,
      },
    );
    (await pd.capReached()).toString().should.be.equal('1');

    const members = [member1, member2, member3, staker1, staker2];

    for (let member of members) {
      await mr.payJoiningFee(member, { from: member, value: fee });
      await mr.kycVerdict(member, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member });
      await tk.transfer(member, ether('250'));
    }



    // await tf.addStake(smartConAdd, stakeTokens, { from: staker1 });
    // await tf.addStake(smartConAdd, stakeTokens, { from: staker2 });
    // maxVotingTime = await cd.maxVotingTime();
    // await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
    //   from: member1,
    // });
    // await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
    //   from: member2,
    // });
    // await tc.lock(LOCK_REASON_CLAIM, tokens, validity, {
    //   from: member3,
    // });

    console.log('done');
  }


  describe('claim amount is higher than stake amount', function () {

    before(setup);
    before(initMembers);

    it('should do nothing', async function () {
      await sleep(2000);
    });
  })
});

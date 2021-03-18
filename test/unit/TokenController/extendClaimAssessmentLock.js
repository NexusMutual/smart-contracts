const { web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { accounts } = require('../utils');
const { assert } = require('chai');

const { members: [member], internalContracts: [internal] } = accounts;
const { toBN } = web3.utils;

const days = n => 3600 * 24 * n;

describe('extendClaimAssessmentLock', function () {

  it('reverts if locking past 180 days from current block time', async function () {

    const { token, tokenController } = this;

    const initalLockTime = toBN(days(180));
    const extendClaimAssessmentLockTime = toBN(days(20));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockClaimAssessmentTokens(ether('50'), initalLockTime, { from: member });
    await expectRevert(
      tokenController.extendClaimAssessmentLock(extendClaimAssessmentLockTime, { from: member }),
      'TokenController: Tokens can be locked for 180 days maximum',
    );
  });

  it('extends lock time as long as it\'s not past 180 days from current block time', async function () {

    const { token, tokenController } = this;

    const initalLockTime = toBN(days(30));
    const extendClaimAssessmentLockTime = toBN(days(1));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockClaimAssessmentTokens(ether('50'), initalLockTime, { from: member });

    await tokenController.extendClaimAssessmentLock(extendClaimAssessmentLockTime, { from: member });
    await tokenController.extendClaimAssessmentLock(extendClaimAssessmentLockTime, { from: member });
    await tokenController.extendClaimAssessmentLock(extendClaimAssessmentLockTime, { from: member });
  });

});

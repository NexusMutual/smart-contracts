const { accounts, web3 } = require('hardhat');
const { expectRevert, ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { coverToCoverDetailsArray } = require('../utils/buyCover');
const { getQuoteSignature } = require('../utils/getQuote');
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { buyCover, ethCoverTemplate, daiCoverTemplate, getBuyCoverDataParameter } = require('./utils');

const [, member1, nonMember1] = accounts;

describe('executeCoverAction', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1]);
  });

  it('reverts on executeCoverAction - no action supported at this time', async function () {
    const { cover } = this.contracts;

    const coverData = { ...ethCoverTemplate };
    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });
    const coverId = 1;

    const ethAmount = ether('1');
    const action = 0;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [ethAmount.toString()]);
    await expectRevert(
      cover.executeCoverAction(coverId, action, executeData, {
        value: ethAmount,
      }),
      'Unsupported action'
    );
  });
});

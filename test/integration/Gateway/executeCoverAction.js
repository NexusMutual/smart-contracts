const { accounts, web3 } = require('hardhat');
const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { enrollMember } = require('../utils/enroll');
const { buyCover, ethCoverTemplate } = require('./utils');

const [, member1] = accounts;

describe('executeCoverAction', function () {
  beforeEach(async function () {
    await enrollMember(this.contracts, [member1]);
  });

  it('reverts on executeCoverAction - no action supported at this time', async function () {
    const { gateway } = this.contracts;

    const coverData = { ...ethCoverTemplate };
    await buyCover({ ...this.contracts, coverData, coverHolder: member1 });
    const coverId = 1;

    const ethAmount = ether('1');
    const action = 0;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [ethAmount.toString()]);
    await expectRevert(
      gateway.executeCoverAction(coverId, action, executeData, {
        value: ethAmount,
      }),
      'Unsupported action',
    );
  });
});

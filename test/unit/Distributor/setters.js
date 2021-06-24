const { web3, accounts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { toBN } = web3.utils;

const [, treasury, coverHolder, newTreasury, nonOwner] = accounts;

describe('buyCover', function () {

  it('allows setting new treasury address by owner', async function () {
    const { distributor } = this.contracts;

    await distributor.setTreasury(newTreasury);

    const currentTreasury = await distributor.treasury();
    assert.equal(newTreasury, currentTreasury);
  });

  it('rejects setting new treasury to 0', async function () {
    const { distributor } = this.contracts;

    await expectRevert(
      distributor.setTreasury('0x0000000000000000000000000000000000000000'),
      'Distributor: treasury address is 0',
    );
  });

  it('disallows setting the fee percentage by non-owner', async function () {
    const { distributor } = this.contracts;

    await expectRevert(
      distributor.setTreasury(newTreasury, { from: nonOwner }),
      'Ownable: caller is not the owner',
    );
  });

  it('allows setting the fee percentage by owner', async function () {
    const { distributor } = this.contracts;

    const newFeePercentage = '20000';

    await distributor.setFeePercentage(newFeePercentage);

    const storedFeePercentage = await distributor.feePercentage();
    assert(storedFeePercentage.toString(), newFeePercentage);
  });

  it('disallows setting the fee percentage by non-owner', async function () {
    const { distributor } = this.contracts;

    const newFeePercentage = '20000';

    await expectRevert(
      distributor.setFeePercentage(newFeePercentage, {
        from: nonOwner,
      }),
      'Ownable: caller is not the owner',
    );
  });
});

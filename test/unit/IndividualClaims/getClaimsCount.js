const { ethers } = require('hardhat');
const { expect } = require('chai');

const { submitClaim, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getClaimsCount', function () {
  it('returns the total number of claims', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(365), 0, false, 0]],
    );

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(0);
    }

    await submitClaim(this)({ coverId: 0, sender: coverOwner });

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(1);
    }

    for (let i = 0; i < 6; i++) {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(30));
      await submitClaim(this)({ coverId: 0, sender: coverOwner });
    }

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(7);
    }
  });
});

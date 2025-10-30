const { ethers } = require('hardhat');
const { expect } = require('chai');

const { createMockCover, submitClaim } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getClaimsCount', function () {
  it('returns the total number of claims', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, {
      owner: coverOwner.address,
      period: daysToSeconds(365),
      gracePeriod: daysToSeconds(30),
    });

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(0);
    }

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(1);
    }

    for (let i = 0; i < 6; i++) {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(30));
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    }

    {
      const count = await individualClaims.getClaimsCount();
      expect(count).to.be.equal(7);
    }
  });
});

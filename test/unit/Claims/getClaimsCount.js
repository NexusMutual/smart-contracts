const { ethers } = require('hardhat');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getClaimsCount', function () {
  it('returns the total number of claims', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(365);
    const coverAmount = parseEther('100');

    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
    );

    {
      const count = await claims.getClaimsCount();
      expect(count).to.be.equal(0);
    }

    await submitClaim(this)({ coverId: 0, sender: coverOwner });

    {
      const count = await claims.getClaimsCount();
      expect(count).to.be.equal(1);
    }

    for (let i = 0; i < 6; i++) {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(30));
      await submitClaim(this)({ coverId: 0, sender: coverOwner });
    }

    {
      const count = await claims.getClaimsCount();
      expect(count).to.be.equal(7);
    }
  });
});

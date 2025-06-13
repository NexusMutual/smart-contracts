const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('setPoolMetadata', function () {
  it('reverts if manager is not the caller', async function () {
    const fixture = await loadFixture(setup);
    const [nonManager] = fixture.accounts.nonMembers;
    const stakingProducts = fixture.stakingProducts.connect(nonManager);

    const poolId = 1;
    const ipfsHash = 'some-string';

    await expect(stakingProducts.setPoolMetadata(poolId, ipfsHash)).to.be.revertedWithCustomError(
      stakingProducts,
      'OnlyManager',
    );
  });

  it('reverts if ipfsHash is empty', async function () {
    const fixture = await loadFixture(setup);
    const [nonManager] = fixture.accounts.nonMembers;
    const stakingProducts = fixture.stakingProducts.connect(nonManager);

    const poolId = 1;
    const emptyIpfsHash = '';

    const setPoolMetadata = stakingProducts.setPoolMetadata(poolId, emptyIpfsHash);
    await expect(setPoolMetadata).to.be.revertedWithCustomError(stakingProducts, 'OnlyManager');
  });

  it('updates pool metadata', async function () {
    const fixture = await loadFixture(setup);
    const [manager] = fixture.accounts.members;
    const stakingProducts = fixture.stakingProducts.connect(manager);

    const poolId = 1;
    const ipfsHash = 'some-string';

    const initialMetadata = await stakingProducts.getPoolMetadata(poolId);
    await stakingProducts.setPoolMetadata(poolId, ipfsHash);
    const updatedMetadata = await stakingProducts.getPoolMetadata(poolId);

    expect(updatedMetadata).to.be.not.equal(initialMetadata);
    expect(updatedMetadata).to.be.equal(ipfsHash);
  });
});

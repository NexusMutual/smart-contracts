const { expect } = require('chai');

describe('editProductTypes', function () {
  it('should edit existing product', async function () {
    const { cover, accounts } = this;

    const productTypeId = 0;

    const gracePeriodInDays = 46;

    const productTypeBefore = await cover.productTypes(productTypeId);

    const ipfsHash = 'my ipfs hash';

    await expect(
      cover
        .connect(accounts.advisoryBoardMembers[0])
        .editProductTypes([productTypeId], [gracePeriodInDays], [ipfsHash]),
    )
      .to.emit(cover, 'ProductTypeSet')
      .withArgs(productTypeId, ipfsHash);

    const productTypeAfter = await cover.productTypes(productTypeId);

    expect(productTypeAfter.claimMethod).to.be.equal(productTypeBefore.claimMethod);
    expect(productTypeAfter.gracePeriodInDays).to.be.equal(gracePeriodInDays);
  });

  it('should revert when called by non-advisory board', async function () {
    const { cover, accounts } = this;

    const productTypeId = 0;
    await expect(
      cover.connect(accounts.nonMembers[0]).editProductTypes([productTypeId], [39], ['my ipfs hash']),
    ).to.be.revertedWith('Caller is not an advisory board member');
  });
});

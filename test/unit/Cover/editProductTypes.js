const { expect } = require('chai');

describe('editProductTypes', function () {
  it('should edit existing product', async function () {
    const { cover, accounts } = this;

    const productTypeId = 0;

    const productTypeData = {
      claimMethod: 2,
      gracePeriodInDays: 45,
    };

    await cover
      .connect(accounts.advisoryBoardMembers[0])
      .editProductTypes([productTypeId], [productTypeData], ['my ipfs hash']);

    const storedProduct = await cover.productTypes(productTypeId);

    expect(storedProduct.claimMethod).to.be.equal(productTypeData.claimMethod);
    expect(storedProduct.gracePeriodInDays).to.be.equal(productTypeData.gracePeriodInDays);
  });

  it('should revert when called by non-advisory board', async function () {
    const { cover, accounts } = this;

    const productTypeId = 0;
    await expect(
      cover.connect(accounts.nonMembers[0]).editProductTypes(
        [productTypeId],
        [
          {
            claimMethod: 1,
            gracePeriodInDays: 39,
          },
        ],
        ['my ipfs hash'],
      ),
    ).to.be.revertedWith('Caller is not an advisory board member');
  });
});

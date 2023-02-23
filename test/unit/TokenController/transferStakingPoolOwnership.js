describe.skip('transferStakingPoolOwnership', function () {
  it('should revert if not called from internal address', async function () {});
  it('should return with no state changes if staking pool count is 0', async function () {});
  it('should set new address of manager of pools, and remove from old', async function () {});

  it('should transfer 20 pools from old manager to new manager', async function () {
    // const { tokenController } = this.contracts;
    // const {
    //   members: [oldManager, newManager],
    //   internalContracts: [internalContract],
    // } = this.accounts;
    //
    // for (let i = 0; i < 20; i++) {
    //   await tokenController.connect(internalContract).assignStakingPoolManager(i, oldManager.address);
    // }
  });
  // TODO: not sure if we want this behavior
  it('should transfer pool ownership to zero address', async function () {});
});

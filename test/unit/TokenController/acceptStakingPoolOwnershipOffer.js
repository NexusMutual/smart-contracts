describe.skip('acceptStakingPoolOwnershipOffer', function () {
  it('should revert if current manager is locked for voting');
  it('should revert if the caller is not the proposed manager');
  it('should revert if the ownership offer has expired');
  it('should remove pools from last manager and add them to new managers list');
  it('should remove the offer after accepting');
  it('should fail to accept a canceled offer');
});

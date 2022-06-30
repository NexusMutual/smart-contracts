describe.only('Quotation integration tests', function () {
  require('./buyCoverWithMetadata');
  require('./makeCoverUsingNXMTokens');
  require('./withdrawCoverNote');
  require('./expireCover');
  require('./getWithdrawableCoverNoteCoverIds');
});

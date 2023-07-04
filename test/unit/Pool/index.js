describe('Pool unit tests', function () {
  // parameters
  require('./updateParameters');

  // token price
  require('./calculateTokenSpotPrice');
  require('./getTokenPrice');
  require('./calculateNXMForEth');
  require('./calculateEthForNXM');
  require('./getPoolValueInEth');
  require('./buyNXM');
  require('./sellNXM');
  require('./sellNXMTokens');
  require('./getMCRRatio');
  require('./getters');

  // pool management
  require('./addAsset');
  require('./setAssetDetails');
  require('./transferAsset');
  require('./upgradeCapitalPool');

  // payout
  require('./sendPayout');

  // swapping
  require('./transferAssetToSwapOperator');
  require('./setSwapDetailsLastSwapTime');
  require('./setSwapValue');
});

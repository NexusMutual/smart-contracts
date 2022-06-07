// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/LegacyMasterAware.sol";
import "../../interfaces/ILegacyClaims.sol";
import "../../interfaces/ILegacyClaimsData.sol";
import "../../interfaces/ILegacyClaimsReward.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
//import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";

/// Claims Reward Contract contains the functions for calculating number of tokens
/// that will get rewarded, unlocked or burned depending upon the status of claim.
contract LegacyClaimsReward is ILegacyClaimsReward, LegacyMasterAware {
  INXMToken internal tk;
  ITokenController internal tc;
  ITokenData internal td;
  IQuotationData internal qd;
  ILegacyClaims internal c1;
  IPool internal pool;
  IGovernance internal gv;
  uint internal unused;
  IMemberRoles internal memberRoles;
  IMCR public mcr;

  // assigned in constructor
  address public DAI;

  // constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint private constant DECIMAL1E18 = uint(10) ** 18;

  constructor (address masterAddress, address _daiAddress) {
    changeMasterAddress(masterAddress);
    DAI = _daiAddress;
  }

  function changeClaimStatus(uint claimid) external override {
    // noop
  }

  function transferRewards() override external {
    // {REWARD_TRANSFERS_HELPER_BEGIN}
    tk.transfer(0x8D38C81B7bE9Dbe7440D66B92d4EF529806baAE7, 35760493284880538281);
    tk.transfer(0x87B2a7559d85f4653f13E6546A14189cd5455d45, 55352901017354677134);
    tk.transfer(0xb7FeE4f0e877A348481355FFf757D8A079A2A48b, 833640762734095);
    tk.transfer(0xe5DD78C224F26E306c84A9B1aa2DEF30bdf15835, 4244323033916347);
    tk.transfer(0xF9fA438fE4723C9B2096868F892c1C5F14bb2cAa, 255737891525236889);
    tk.transfer(0x971965f8981910763a8984204FD2249C04B4202D, 23495676475906360);
    tk.transfer(0x144aAD1020cbBFD2441443721057e1eC0577a639, 78369292856786);
    tk.transfer(0xea4e84f81BeAfA8C0004f15d26fD8835f54E2384, 221085438547705);
    tk.transfer(0x927165752a4dDF685F9D6eF21Fd180b0f9Bc7E03, 269639440705719);
    tk.transfer(0x21Cf5649ee1a9362202EBfF266Ef7BBC8c26A917, 116286322435811720);
    tk.transfer(0x76FE8E056230344B65104ca3c96FF062bFAf9cf7, 292661475471199774);
    tk.transfer(0x0A8C2eE08760251705f5aaF7bb0E7B490029Bc27, 292164303519382683);
    tk.transfer(0x57F589DcBd0fd14b4528018f8Ba6777696D38ECD, 195857733291784);
    tk.transfer(0xCb95cAB0D557808491A0d498aCaE4fb37277da00, 797989782506267);
    tk.transfer(0xB791CE850C29732D7F8116d813457c840040102b, 151075450744570);
    tk.transfer(0xFC64382c9Ce89bA1C21692A68000366a35fF0336, 345525383725487030);
    tk.transfer(0x65711ee91AFC72398E7F9DB2F8B0f73a87Cc524c, 909958561377403);
    tk.transfer(0x0B6625300742Cc4aace3CBE85296a4D19D16aA3f, 385299571488172);
    tk.transfer(0xe8b27fb302B9629FA54b070119b6Ed1AFE42De19, 4149058133053374);
    tk.transfer(0xbe26316df4399a9762DF24c7c12D619b3ECaA9a0, 3731609920104424);
    tk.transfer(0xc5E37eb0D48C8edD6a842D47B2c288eFa1773435, 229547229008);
    tk.transfer(0x81941E3DeEeA41b6309045ECbAFd919Db5aF6147, 166386849852224);
    tk.transfer(0x8C767cc84C5cC3aD35DCa39919D9c3906E4E1998, 22954722900832);
    tk.transfer(0xD8eD830E33859AF668Bf4bF1550DFe4CC9984157, 6374079622486500);
    tk.transfer(0xa13eF1eB4f6603321f05a95C0E8bb2c847FFe5a2, 1292070249286796);
    tk.transfer(0x0616e02d2492e33ABa850b9a83cFd379169c00be, 4734737571918997);
    tk.transfer(0x7f8069Dfdd61f3AaAbDFf9F6D7257496733D340d, 2474823651144190);
    tk.transfer(0x92A0b2C089733beF43Ac367D2CE7783526AEA590, 7860439097919);
    tk.transfer(0xbee0889F9f74090889C3AD5fDf174b6Af6480607, 31441756391679);
    tk.transfer(0x4c262bA680b20640a51d00a7D2D3115a54A04108, 5242073859524);
    tk.transfer(0x07cD0dffB4ca317c56c232A8130a7c3f07BF207A, 92726739727973018);
    tk.transfer(0xa7009b120eb1016A91a9aCEC52D243BEf01de74e, 10651502465310038504);
    tk.transfer(0xf76e252e3c40EEF8A90a4fcD1a34ee8209115074, 210504943489815226);
    tk.transfer(0x2255B4523939045C6F4C42fD0b6d945C52bE98A8, 102063437327263615);
    tk.transfer(0xF7e5Ac6564105980d1c1ECd7a3b4C5a8bAe9982E, 446637592594148042);
    // {REWARD_TRANSFERS_HELPER_END}

    uint remainderNMX = tk.balanceOf(address(this));
    tk.approve(address(tc), remainderNMX);
    tc.operatorTransfer(address(this), address(tc), remainderNMX);
  }

  function changeDependentContractAddress() public onlyInternal {
    c1 = ILegacyClaims(ms.getLatestAddress("CL"));
    tk = INXMToken(ms.tokenAddress());
    tc = ITokenController(ms.getLatestAddress("TC"));
    td = ITokenData(ms.getLatestAddress("TD"));
    qd = IQuotationData(ms.getLatestAddress("QD"));
    gv = IGovernance(ms.getLatestAddress("GV"));
    //pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
    memberRoles = IMemberRoles(ms.getLatestAddress("MR"));
    pool = IPool(ms.getLatestAddress("P1"));
    mcr = IMCR(ms.getLatestAddress("MC"));
  }

  /**
   * @dev Claims are closable by anyone
   * @param _claimId id of claim to be closed.
   */
  function closeClaim(uint _claimId) external {
    // noop
  }

  function getCurrencyAssetAddress(bytes4 currency) public override view returns (address) {

    if (currency == "ETH") {
      return ETH;
    }

    if (currency == "DAI") {
      return DAI;
    }

    revert("ClaimsReward: unknown asset");
  }

  /// @dev Transfers all tokens held by contract to a new contract in case of upgrade.
  function upgrade(address _newAdd) public override onlyInternal {
    uint amount = tk.balanceOf(address(this));
    if (amount > 0) {
      require(tk.transfer(_newAdd, amount));
    }

  }
}

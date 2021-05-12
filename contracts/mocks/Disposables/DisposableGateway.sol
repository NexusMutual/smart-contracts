pragma solidity ^0.5.0;

import "../../interfaces/IERC20Detailed.sol";
import "../../modules/capital/Pool.sol";
import "../../modules/governance/MemberRoles.sol";
import "../../modules/token/TokenController.sol";
import "../../modules/token/TokenData.sol";
import "../../modules/token/TokenData.sol";
import "../../modules/token/TokenFunctions.sol";
import "../../modules/cover/QuotationData.sol";
import "../../modules/cover/Gateway.sol";
import "../../modules/claims/Incidents.sol";

contract DisposableGateway is Gateway {

  constructor() public Gateway() {
  }

  function initialize(address masterAddress, address daiAddress) external {
    master = INXMMaster(masterAddress);
    quotation = Quotation(master.getLatestAddress("QT"));
    nxmToken = NXMToken(master.tokenAddress());
    tokenController = TokenController(master.getLatestAddress("TC"));
    quotationData = QuotationData(master.getLatestAddress("QD"));
    claimsData = ClaimsData(master.getLatestAddress("CD"));
    claims = Claims(master.getLatestAddress("CL"));
    incidents = Incidents(master.getLatestAddress("IC"));
    pool = Pool(master.getLatestAddress("P1"));
    memberRoles = MemberRoles(master.getLatestAddress("MR"));
    DAI = daiAddress;
  }
}

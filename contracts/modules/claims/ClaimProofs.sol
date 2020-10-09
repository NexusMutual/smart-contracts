pragma solidity ^0.5.0;

import "../../abstract/INXMMaster.sol";
import "../cover/QuotationData.sol";

contract ClaimProofs {

  INXMMaster internal ms;
  address public masterAddress;

  constructor(address _masterAddress) public {
    masterAddress = _masterAddress;
    ms = INXMMaster(_masterAddress);
  }

  event ProofAdded(uint indexed coverId, address indexed owner, string ipfsHash);

  function addProof(uint _coverId, string calldata _ipfsHash) external {
    QuotationData qd = QuotationData(ms.getLatestAddress("QD"));
    uint8 coverStatus;
    (, coverStatus,,,) = qd.getCoverDetailsByCoverID2(_coverId);
    require(coverStatus != uint8(QuotationData.CoverStatus.ClaimSubmitted), "Claim already submitted");
    emit ProofAdded(_coverId, msg.sender, _ipfsHash);
  }

}

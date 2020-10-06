pragma solidity ^0.5.0;

import "../../abstract/INXMMaster.sol";
import "../cover/QuotationData.sol";

contract ClaimProofs {

  INXMMaster internal ms;
  address public masterAddress;

  // Should we allow this address to be changed or would we just deploy a new contract
  // if the master ever changes?
  constructor(address _masterAddress) public {
    masterAddress = _masterAddress;
    ms = INXMMaster(_masterAddress);
  }

  event ProofAdded(uint indexed coverId, address indexed owner, string ipfsHash);

  function addProof(uint _coverId, string calldata _ipfsHash) external {
    QuotationData qd = QuotationData(ms.getLatestAddress("QD"));
    uint8 cStatus;
    (, cStatus,,,) = qd.getCoverDetailsByCoverID2(_coverId);
    require(cStatus != uint8(QuotationData.CoverStatus.ClaimSubmitted), "Claim already submitted");

    // The following require statement might be unnecessary since you won't be able to open
    // claims and the UI won't allow you to addProofs so you'd do this at your own expense
    require(cStatus != uint8(QuotationData.CoverStatus.CoverExpired), "Cover already expired");
    emit ProofAdded(_coverId, msg.sender, _ipfsHash);
  }

}

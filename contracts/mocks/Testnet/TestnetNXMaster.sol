// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/governance/NXMaster.sol";

contract TestnetNXMaster is NXMaster {

    address public governanceOwner;

    modifier onlyGovernanceOwner() {
        require(msg.sender == governanceOwner, "Ownable: caller is not the owner");
        _;
    }

    function initializeGovernanceOwner() public {
        if (governanceOwner != address(0)) {
            revert("Already initialized");
        }
        governanceOwner = msg.sender;
    }

    function switchGovernanceAddress(address payable newGV) external onlyGovernanceOwner {
        address currentGV = contractAddresses["GV"];
        contractAddresses["GV"] = newGV;
        contractsActive[currentGV] = false;
        contractsActive[newGV] = true;
    }

    function upgradeMultipleContracts(
        bytes2[] memory _contractsName,
        address payable[] memory _contractsAddress
    )
    public
    {
        require(getLatestAddress("GV") == msg.sender || governanceOwner == msg.sender, "Not authorized");
        require(_contractsName.length == _contractsAddress.length, "Array length should be equal.");

        for (uint i = 0; i < _contractsName.length; i++) {

            address payable newAddress = _contractsAddress[i];
            require(newAddress != address(0), "NULL address is not allowed.");
            require(isUpgradable[_contractsName[i]], "Contract should be upgradable.");

            if (_contractsName[i] == "QT") {
                IQuotation qt = IQuotation(contractAddresses["QT"]);
                qt.transferAssetsToNewContract(newAddress);

            } else if (_contractsName[i] == "CR") {
                ITokenController tc = ITokenController(getLatestAddress("TC"));
                tc.addToWhitelist(newAddress);
                tc.removeFromWhitelist(contractAddresses["CR"]);
                IClaimsReward cr = IClaimsReward(contractAddresses["CR"]);
                cr.upgrade(newAddress);

            } else if (_contractsName[i] == "P1") {
                IPool p1 = IPool(contractAddresses["P1"]);
                p1.upgradeCapitalPool(newAddress);
            }

            address payable oldAddress = contractAddresses[_contractsName[i]];
            contractsActive[oldAddress] = false;
            contractAddresses[_contractsName[i]] = newAddress;
            contractsActive[newAddress] = true;

            LegacyMasterAware up = LegacyMasterAware(contractAddresses[_contractsName[i]]);
            up.changeMasterAddress(address(this));
        }

        _changeAllAddress();
    }
}

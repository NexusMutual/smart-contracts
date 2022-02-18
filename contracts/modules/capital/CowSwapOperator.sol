// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../../external/cow/GPv2Order.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

interface ICowSettlement {
    function setPreSignature(bytes calldata orderUid, bool signed) external;
}

contract CowSwapOperator {
    ICowSettlement public immutable cowSettlement;
    address public immutable cowVaultRelayer;

    constructor(address _cowSettlement, address _cowVaultRelayer) {
        cowSettlement = ICowSettlement(_cowSettlement);
        cowVaultRelayer = _cowVaultRelayer;
    }

    function placeOrder(
        GPv2Order.Data calldata order,
        bytes32 domainSeparator,
        bytes calldata orderUID
    ) public {
        require(
            validateUID(order, domainSeparator, orderUID),
            "Provided UID doesnt match calculated UID"
        );

        require(order.sellToken.balanceOf(address(this)) >= order.sellAmount, "Not enough token balance to sell");
        require(order.sellTokenBalance == GPv2Order.BALANCE_ERC20, "Only erc20 supported for sellTokenBalance");
        require(order.buyTokenBalance == GPv2Order.BALANCE_ERC20, "Only erc20 supported for buyTokenBalance");
        require(order.kind == GPv2Order.KIND_SELL, "Only sell operations are supported");
        require(order.receiver == address(this), "Receiver must be this contract");
        require(order.validTo >= block.timestamp + 600, "validTo must be at least 10 minutes in the future");
        // TODO: sellToken validation
        // TODO: buyToken validation
        // TODO: sellAmount validation
        // TODO: buyAmount validation
        // TODO: feeAmount validation

        approveVaultRelayer(order.sellToken, order.sellAmount + order.feeAmount);

        cowSettlement.setPreSignature(orderUID, true);
    }

    function approveVaultRelayer(IERC20 token, uint amount) private {
        token.approve(cowVaultRelayer, amount); // infinite approval
    }

    function validateUID(GPv2Order.Data calldata order, bytes32 domainSeparator, bytes calldata providedOrderUID) private pure returns (bool) {
        bytes memory calculatedUID = getUID(order, domainSeparator);
        return keccak256(calculatedUID) == keccak256(providedOrderUID);
    }

    function getDigest(GPv2Order.Data calldata order, bytes32 domainSeparator) public pure returns (bytes32) {
        bytes32 hash = GPv2Order.hash(order, domainSeparator);
        return hash;
    }

    function getUID(GPv2Order.Data calldata order, bytes32 domainSeparator) public pure returns (bytes memory){
        bytes memory uid = new bytes(56);
        bytes32 digest = getDigest(order, domainSeparator);
        GPv2Order.packOrderUidParams(uid, digest, order.receiver, order.validTo);
        return uid;
    }
}
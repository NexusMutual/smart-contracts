// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../libraries/external/EnumerableSet.sol";

/**
 * @title EnumerableSetMock
 * @dev Mock contract for testing EnumerableSet library
 */
contract EnumerableSetMock {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    EnumerableSet.UintSet private _uintSet;
    EnumerableSet.AddressSet private _addressSet;
    EnumerableSet.Bytes32Set private _bytes32Set;

    // UintSet functions
    function addUint(uint256 value) external returns (bool) {
        return _uintSet.add(value);
    }

    function removeUint(uint256 value) external returns (bool) {
        return _uintSet.remove(value);
    }

    function clearUint() external {
        _uintSet.clear();
    }

    function containsUint(uint256 value) external view returns (bool) {
        return _uintSet.contains(value);
    }

    function lengthUint() external view returns (uint256) {
        return _uintSet.length();
    }

    function atUint(uint256 index) external view returns (uint256) {
        return _uintSet.at(index);
    }

    function valuesUint() external view returns (uint256[] memory) {
        return _uintSet.values();
    }

    // AddressSet functions
    function addAddress(address value) external returns (bool) {
        return _addressSet.add(value);
    }

    function removeAddress(address value) external returns (bool) {
        return _addressSet.remove(value);
    }

    function clearAddress() external {
        _addressSet.clear();
    }

    function containsAddress(address value) external view returns (bool) {
        return _addressSet.contains(value);
    }

    function lengthAddress() external view returns (uint256) {
        return _addressSet.length();
    }

    function atAddress(uint256 index) external view returns (address) {
        return _addressSet.at(index);
    }

    function valuesAddress() external view returns (address[] memory) {
        return _addressSet.values();
    }

    // Bytes32Set functions
    function addBytes32(bytes32 value) external returns (bool) {
        return _bytes32Set.add(value);
    }

    function removeBytes32(bytes32 value) external returns (bool) {
        return _bytes32Set.remove(value);
    }

    function clearBytes32() external {
        _bytes32Set.clear();
    }

    function containsBytes32(bytes32 value) external view returns (bool) {
        return _bytes32Set.contains(value);
    }

    function lengthBytes32() external view returns (uint256) {
        return _bytes32Set.length();
    }

    function atBytes32(uint256 index) external view returns (bytes32) {
        return _bytes32Set.at(index);
    }

    function valuesBytes32() external view returns (bytes32[] memory) {
        return _bytes32Set.values();
    }
}
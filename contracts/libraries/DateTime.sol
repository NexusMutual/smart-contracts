// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Modified from: https://github.com/bokkypoobah/BokkyPooBahsDateTimeLibrary/blob/master/contracts/BokkyPooBahsDateTimeLibrary.sol
library DateTime {
  uint constant SECONDS_PER_MINUTE = 60;
  uint constant SECONDS_PER_HOUR = SECONDS_PER_MINUTE * SECONDS_PER_MINUTE;
  uint constant SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
  int constant OFFSET19700101 = 2440588;


  function _daysToDate(uint _days) internal pure returns (uint year, uint month, uint day) {
    int __days = int(_days);

    int L = __days + 68569 + OFFSET19700101;
    int N = 4 * L / 146097;
    L = L - (146097 * N + 3) / 4;
    int _year = 4000 * (L + 1) / 1461001;
    L = L - 1461 * _year / 4 + 31;
    int _month = 80 * L / 2447;
    int _day = L - 2447 * _month / 80;
    L = _month / 11;
    _month = _month + 2 - 12 * L;
    _year = 100 * (N - 49) + _year + L;

    year = uint(_year);
    month = uint(_month);
    day = uint(_day);
  }

  function timestampToDate(uint timestamp) internal pure returns (uint year, uint month, uint day) {
    (year, month, day) = _daysToDate(timestamp / SECONDS_PER_DAY);
  }

  function getMonthString(uint month) internal pure returns (string memory) {
    if (month == 1) { return "Jan"; }
    if (month == 2) { return "Feb"; }
    if (month == 3) { return "Mar"; }
    if (month == 4) { return "Apr"; }
    if (month == 5) { return "May"; }
    if (month == 6) { return "Jun"; }
    if (month == 7) { return "Jul"; }
    if (month == 8) { return "Aug"; }
    if (month == 9) { return "Sep"; }
    if (month == 10) { return "Oct"; }
    if (month == 11) { return "Nov"; }
    if (month == 12) { return "Dec"; }
    revert("Invalid month");
  }
}

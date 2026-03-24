import React from 'react';
import './SearchBar.css';
import { FaBars, FaSearch, FaCaretDown } from 'react-icons/fa';

const SearchBar = ({ setSearchTerm }) => {
  return (
    <div className="search-bar-wrapper">
      <button className="action-btn">
        <FaBars />
      </button>

      <div className="input-group search-group">
        <FaSearch className="icon-muted" />
        <input
          type="text"
          placeholder="Tìm sản phẩm (VD: bạc sỉu...)"
          className="custom-input"
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        <FaCaretDown className="icon-muted cursor-pointer" />
      </div>
    </div>
  );
};

export default SearchBar;
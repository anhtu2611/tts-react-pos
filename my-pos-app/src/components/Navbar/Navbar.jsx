import React, { useState } from 'react';
import './Navbar.css';
import { FaBars, FaBell, FaCaretDown } from 'react-icons/fa';

const Navbar = () => {
  const navTabs = ['MẶT HÀNG', 'ĐƠN HÀNG', 'KHÁCH HÀNG', 'ƯU ĐÃI'];
  const [activeTab, setActiveTab] = useState('MẶT HÀNG');

  return (
    <nav className="navbar">
      <div className="navbar-left">
        {navTabs.map((tab) => (
          <div
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>
     
      <div className="navbar-right">
        <span className="user-email">pos@gmail.com</span>
        <button className="notification-btn">
          <FaBell />
          <span className="notification-badge">1</span>
        </button>
        
        <div className="location-container">
          <select className="location-selector" defaultValue="Quận 1">
            <option value="Quận 1">Quận 1</option>
            <option value="Quận 2">Quận 2</option>
            <option value="Quận 3">Quận 3</option>
          </select>
        </div>
  
        <div className="pos-info">
          <span>Điểm bán</span>
        </div>
     
        <button className="menu-btn">
          <FaBars />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
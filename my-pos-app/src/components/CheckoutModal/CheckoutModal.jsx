import React, { useState, useEffect } from 'react';
import './CheckoutModal.css';

const CheckoutModal = ({ cartItems, onClose, onConfirm }) => {
  const totalAmount = cartItems.reduce((total, item) => total + (item.quantity * item.price), 0);
  const [customerPaid, setCustomerPaid] = useState(totalAmount);
  const change = customerPaid - totalAmount;
  const currentTime = new Date().toLocaleString('vi-VN');

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Phiếu thanh toán</h2>
          <button className="close-btn" onClick={onClose}></button>
        </div>
        
        <div className="modal-body">
          <div className="modal-left">
            <h4 className="section-title">Khác</h4>
            <table className="checkout-table">
              <tbody>
                {cartItems.map((item, index) => (
                  <tr key={item.id}>
                    <td className="stt-col">{index + 1}</td>
                    <td className="item-name">{item.name}</td>
                    <td>
                      <input type="number" value={item.quantity} readOnly className="readonly-qty" />
                    </td>
                    <td className="text-right">{item.price.toLocaleString()}</td>
                    <td className="text-right">{(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="modal-right">
            <div className="datetime-row">
              <span>{currentTime} 📅 🕒</span>
            </div>
            
            <div className="summary-line">
              <span>Tổng tiền hàng</span>
              <span>{totalAmount.toLocaleString()}</span>
            </div>
            <div className="summary-line">
              <span>Giảm giá</span>
              <span>0</span>
            </div>
            <div className="summary-line highlight-red">
              <span>Khách cần trả</span>
              <span>{totalAmount.toLocaleString()}</span>
            </div>
            
            <div className="summary-line input-line">
              <span>Khách thanh toán <br/><small>(Tiền mặt)</small></span>
              <div className="input-wrapper">
                <span className="cash-icon">💵</span>
                <input 
                  type="number" 
                  value={customerPaid} 
                  onChange={(e) => setCustomerPaid(Number(e.target.value))}
                  className="pay-input"
                  min="0"
                />
              </div>
            </div>
            
            <div className="summary-line highlight-bold">
              <span>Tiền thừa trả khách</span>
              <span>{change > 0 ? change.toLocaleString() : 0}</span>
            </div>

            <div className="modal-actions">
              <div className="action-row">
                <button className="btn-promo-modal">CTKM</button>
                <button className="btn-next-modal" onClick={onConfirm}>Tiếp theo</button>
              </div>
              <button className="btn-delivery-modal">Chiết khấu Delivery</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;
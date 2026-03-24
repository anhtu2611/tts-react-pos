
import React, { useState } from 'react';
import './Cart.css';
import { FaSearch, FaPlus, FaTrashAlt, FaMinus } from 'react-icons/fa';
import CheckoutModal from '../CheckoutModal/CheckoutModal';

const CartArea = ({ cartItems, setCartItems }) => {

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const handleIncrease = (id) => {
    const newCart = cartItems.map((item) =>
      item.id === id ? { ...item, quantity: item.quantity + 1 } : item
    );
    setCartItems(newCart);
  };

  const handleDecrease = (id) => {
    const newCart = cartItems.map((item) =>
      item.id === id && item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : item
    );
    setCartItems(newCart);
  };

  const handleDelete = (id) => {
    const newCart = cartItems.filter((item) => item.id !== id);
    setCartItems(newCart);
  };

  const totalQuantity = cartItems.reduce((total, item) => total + item.quantity, 0);
  const grandTotal = cartItems.reduce((total, item) => total + (item.quantity * item.price), 0);

const handleCheckoutClick = () => {
    if (cartItems.length === 0) {
      alert("Giỏ hàng đang trống! Vui lòng chọn món trước khi thanh toán.");
      return; 
    }
    setIsCheckoutOpen(true);
  };

  const handleConfirmPayment = () => {
    alert("In hóa đơn thành công!");
    setCartItems([]); 
    setIsCheckoutOpen(false); 
  };

  return (
    <div className="cart-area">
      <div className="member-search-section">
        <input type="text" placeholder="Mã thành viên" className="member-input" />
        <button className="icon-btn"><FaSearch /></button>
        <button className="icon-btn text-blue"><FaPlus /></button>
      </div>

      <div className="cart-table-container">
        <table className="cart-table">
          <thead>
            <tr>
              <th className="text-left">Mặt hàng</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Tổng cộng</th>
              <th>Xóa</th>
            </tr>
          </thead>
          <tbody>
            {cartItems.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center" style={{ padding: '20px', color: '#888' }}>
                  Chưa có sản phẩm nào trong giỏ hàng.
                </td>
              </tr>
            ) : (
              cartItems.map((item) => (
                <tr key={item.id}>
                  <td className="text-left">{item.name}</td>
                  <td className="text-center">{item.unit}</td>
                  <td className="text-center">
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => handleDecrease(item.id)}><FaMinus /></button>
                      <span className="qty-display">{item.quantity}</span>
                      <button className="qty-btn" onClick={() => handleIncrease(item.id)}><FaPlus /></button>
                    </div>
                  </td>
                  <td className="text-right">{item.price.toLocaleString()}</td>
                  <td className="text-right">{(item.price * item.quantity).toLocaleString()}</td>
                  <td className="text-center">
                    <button className="delete-btn" onClick={() => handleDelete(item.id)}>
                      <FaTrashAlt />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="cart-summary">
        <div className="summary-row border-bottom">
          <span>Tổng SL:</span>
          <span>{totalQuantity}</span>
          <span>{grandTotal.toLocaleString()}</span>
        </div>
        <div className="summary-row highlight">
          <span>CK:</span>
          <span>Tổng CK: 0</span>
          <span className="grand-total">Thành tiền: {grandTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="action-buttons">
        <button className="btn btn-pay" onClick={handleCheckoutClick}>Thanh toán</button>
        <button className="btn btn-cancel" onClick={() => setCartItems([])}>Hủy</button>
        <button className="btn btn-promo">CTKM</button>
      </div>

      {isCheckoutOpen && (
        <CheckoutModal 
          cartItems={cartItems} 
          onClose={() => setIsCheckoutOpen(false)} 
          onConfirm={handleConfirmPayment}
        />
      )}

    </div>
  );
};

export default CartArea;
import React, { useState } from 'react';
import './ProductCard.css';

const ProductArea = ({ products, isLoading, onAddToCart, searchTerm }) => {
  const categories = [
    'TẤT CẢ', 'PHỤ KIỆN', 'CÀ PHÊ', 'TRÀ', 'TRÀ SỮA', 'ĐÁ XAY', 
    'NƯỚC ÉP', 'NƯỚC SUỐI', 'SEASON', 'THỨC UỐNG NÓNG', 
    'BÁNH NGỌT', 'BÁNH MÌ', 'COMBO SẢN PHẨM'
  ];

  const [activeCategory, setActiveCategory] = useState('TẤT CẢ');
  const filteredProducts = products.filter((product) => {
    const isMatchCategory = activeCategory === 'TẤT CẢ' || product.category === activeCategory;
    const isMatchSearch = !searchTerm || searchTerm.trim() === '' || product.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
    return isMatchCategory && isMatchSearch;
  });

  return (
    <div className="product-area">
      <div className="category-container">
        {categories.map((category) => (
          <button
            key={category}
            className={`category-btn ${activeCategory === category ? 'active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="product-grid">
        {isLoading ? (
          <div style={{ padding: 20 }}>Đang tải thực đơn từ Server...</div>
        ) : (
          filteredProducts.map((product) => (
            <div 
              className="product-card" 
              key={product.id} 
              onClick={() => onAddToCart(product)}
            >
              <div className="card-header">
                <div className="info-icon">i</div>
              </div>
              <div className="product-img-container">
                <img src={product.image} alt={product.name} className="product-img" />
              </div>
              <div className="card-footer">
                <div className="product-name">{product.name}</div>
                <div className="product-price">{product.price.toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
        
        {!isLoading && filteredProducts.length === 0 && (
          <div style={{ padding: 20, color: '#888', gridColumn: '1 / -1', textAlign: 'center' }}>
            Không tìm thấy sản phẩm nào phù hợp.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductArea;
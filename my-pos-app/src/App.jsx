import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar/Navbar';
import SearchBar from './components/SearchBar/SearchBar';
import ProductArea from './components/ProductCard/ProductCard';
import CartArea from './components/Cart/Cart';
import './App.css';

function App() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  // Mô phỏng gọi API lấy dữ liệu
  useEffect(() => {
    setTimeout(() => {
      const mockApiData = [
        { id: 1, name: 'CÀ PHÊ', price: 47000, image: '/images/coffe.jpg', category: 'CÀ PHÊ' },
        { id: 2, name: 'NƯỚC ÉP', price: 37000, image: '/images/juice.jpg', category: 'NƯỚC ÉP' },
        { id: 3, name: 'TRÀ', price: 35000, image: '/images/tea.jpg', category: 'TRÀ' },
        { id: 4, name: 'TRÀ SỮA', price: 47000, image: '/images/milk-tea.jpg', category: 'TRÀ SỮA'},
        { id: 5, name: 'TRÀ SỮA TRÂN CHÂU', price: 40000, image: '/images/milk-tea.jpg', category: 'TRÀ SỮA' },
        { id: 6, name: 'CÀ PHÊ 2', price: 47000, image: '/images/coffe.jpg', category: 'CÀ PHÊ' },
        { id: 7, name: 'NƯỚC ÉP 2', price: 37000, image: '/images/juice.jpg', category: 'NƯỚC ÉP' },
        { id: 8, name: 'TRÀ 2', price: 35000, image: '/images/tea.jpg', category: 'TRÀ' },
        { id: 9, name: 'TRÀ SỮA 2', price: 47000, image: '/images/milk-tea.jpg', category: 'TRÀ SỮA'},
        { id: 10, name: 'TRÀ SỮA TRÂN CHÂU 2', price: 40000, image: '/images/milk-tea.jpg', category: 'TRÀ SỮA' }, 
      ];
      setProducts(mockApiData);
      setIsLoading(false);
    }, 1000);
  }, []);

  const handleAddToCart = (product) => {
    const existingItem = cartItems.find((item) => item.id === product.id);
    if (existingItem) {
      const newCart = cartItems.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      setCartItems(newCart);
    } else {
      const newItem = { ...product, unit: 'Ly', quantity: 1 };
      setCartItems([...cartItems, newItem]); 
    }
  };

  return (
    <div className="app-container">
      <Navbar />
      <SearchBar setSearchTerm={setSearchTerm} />
      
      <div className="main-content">
        <ProductArea 
          products={products} 
          isLoading={isLoading} 
          onAddToCart={handleAddToCart} 
          searchTerm={searchTerm} 
        />
        <CartArea 
          cartItems={cartItems} 
          setCartItems={setCartItems} 
        />
      </div>
    </div>
  );
}

export default App;

